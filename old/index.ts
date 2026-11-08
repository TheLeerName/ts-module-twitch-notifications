import Core, { type BaseData, type IModule } from "../../index.js";
import TwitchModule from "../twitch/index.js";
import DiscordModule from "../discord/index.js";

import SlashCommandChannelAdd from "./slash-commands/channel-add.js";
import SlashCommandChannelGet from "./slash-commands/channel-get.js";
import SlashCommandChannelRemove from "./slash-commands/channel-remove.js";
import SlashCommandGet, { slashCommandGetName } from "./slash-commands/get.js";
import SlashCommandSet from "./slash-commands/set.js";

import twitchPollingInitialize from "./twitch-polling.js";
import { textMap } from "./messages.js";
import twitchEventSubInitialize, { updateState } from "./twitch-eventsub.js";
import * as Data from "./data.js";

import * as Discord from "discord.js";
import * as Twitch from "twitch.ts";

class TwitchNotificationsModule {
	readonly name = "twitch-notifications" as const;
	readonly data: Data.default;
	readonly log = Core.log.makeFunctions(this.name);

	constructor() {
		this.data = new Data.default(this);

		DiscordModule
			.once("addAuthorizationFields", a => a
				.addPermissions(Discord.PermissionFlagsBits.CreatePublicThreads, Discord.PermissionFlagsBits.ManageChannels, Discord.PermissionFlagsBits.ReadMessageHistory, Discord.PermissionFlagsBits.SendMessages, Discord.PermissionFlagsBits.SendMessagesInThreads, Discord.PermissionFlagsBits.ViewChannel, Discord.PermissionFlagsBits.UseApplicationCommands)
				.addIntents(Discord.GatewayIntentBits.Guilds)
				.addPartials(Discord.Partials.Channel, Discord.Partials.Message))
			.once("afterClientCreation", () => this.afterDiscordClientCreation());
		TwitchModule
			.once("initialized", () => this.onTwitchInitialized());
	}

	protected afterDiscordClientCreation() {
		DiscordModule.slashCommands.push(SlashCommandChannelAdd(), SlashCommandChannelGet(), SlashCommandChannelRemove(), SlashCommandGet(), SlashCommandSet());

		DiscordModule.client
			.on("guildCreate", guild => this.onGuildCreate(guild))
			.on("guildDelete", guild => this.onGuildDelete(guild));
	}

	protected async onTwitchInitialized() {
		await this.data.initialize();
		twitchEventSubInitialize();
		twitchPollingInitialize();
	}

	protected async onGuildCreate(guild: Discord.Guild) {
		if (DiscordModule.slashCommands.isCommandInGuildAllowed(slashCommandGetName, guild.id))
			await this.data.getGuild(guild.id);
	}

	protected async onGuildDelete(guild: Discord.Guild) {
		const guildData = this.data.guilds.get(guild.id);
		if (!guildData) return;

		if (guildData.isEnabled()) {
			guildData.disable();
			this.data.save();

			this.log.warn("Disabled guild data", {args: {
				guild: `${guild.name} (${guild.id})`,
				reason: "Discord bot was kicked/banned from guild"
			}});
		}
	}

	readonly updateUserDataTimeoutMS = 1800000; // 30 minutes
	async getUserData(channelID: string): Promise<Data.TwitchChannel["user"] | null> {
		const responseGetUsers = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetUsers, TwitchModule.authorization, { id: channelID });
		if (!responseGetUsers.ok) {
			this.log.error("Error occurred while getting twitch user data", {args: {channelID, status: responseGetUsers.status, message: responseGetUsers.message}});
			return null;
		}
		if (responseGetUsers.data.length > 0) {
			const user: any = responseGetUsers.data[0];
			user.lastUpdatedTimestamp = Date.now();
			return user;
		}
		return null;
	}
	async updateUserData(channel: Data.TwitchChannel) {
		if (Date.now() > channel.user.lastUpdatedTimestamp + this.updateUserDataTimeoutMS)
			return;

		const responseGetUsers = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetUsers, TwitchModule.authorization, { id: channel.user.id });
		if (!responseGetUsers.ok) {
			this.log.error("Error occurred while getting twitch user data", {args: {channel: `${channel.user.login} (${channel.user.id})`, status: responseGetUsers.status, message: responseGetUsers.message}});
			return;
		}
		if (responseGetUsers.data.length === 0) {
			channel.banned = true;
			return;
		}

		const changedEntries: [keyof Twitch.ResponseBody.GetUsers["data"][0], string | number | undefined, string | number | undefined][] = [];
		for (const [k, v] of this.objectTypedEntries<string | number | undefined, keyof Twitch.ResponseBody.GetUsers["data"][0]>(responseGetUsers.data[0] as any)) {
			const oldV = channel.user[k];
			if (oldV !== v) {
				(channel.user as any)[k] = v;
				changedEntries.push([k, oldV, v]);
			}
		}
		channel.user.lastUpdatedTimestamp = Date.now();
		channel.banned = false;
		if (changedEntries.length > 0)
			this.log.verbose("We have updated twitch user entries!", {args: {
				user: `${channel.user.login} (${channel.user.id})`,
				changedEntries: changedEntries.map(([entry, oldValue, newValue]) => `${entry}: ${JSON.stringify(oldValue)} => ${JSON.stringify(newValue)}`).join(", ")
			}});
	}

	async createDiscordChannel(guild: Discord.Guild, twitchChannelLogin: string, categoryID: string) {
		const name = textMap.discordChannelNameOffline.replaceAll("%1", twitchChannelLogin);
		return await Core.tasks.queue<Discord.NewsChannel | Discord.TextChannel>(`guild_${guild.id}_channelCreate_${name}`, signal => new Promise((resolve, reject) => {
			signal.addEventListener("abort", _ => reject());
			guild.channels.create({name, type: guild.features?.includes("COMMUNITY") ? Discord.ChannelType.GuildAnnouncement : Discord.ChannelType.GuildText, parent: categoryID, topic: textMap.discordChannelTopic}).then(resolve).catch(reject);
		}));
	}

	/** WARNING: can throw an error */
	async getDiscordThread(message: Discord.Message<true>) {
		return message.thread ?? await Core.tasks.queue<Discord.PublicThreadChannel<false>>(`discordmessage_${message.id}_startThread`, signal => new Promise((resolve, reject) => {
			signal.addEventListener("abort", _ => reject());
			message.startThread({name: "Логи", autoArchiveDuration: Discord.ThreadAutoArchiveDuration.OneDay}).then(resolve).catch(reject);
		}));
	}

	makeDiscordMessageLink(guildID: string, channelID: string, messageID: string) {
		return `https://discordapp.com/channels/${guildID}/${channelID}/${messageID}`;
	}

	objectTypedEntries<Value extends any = string | number, Key extends keyof any = string>(o: {[s in Key]: Value}) {
		return Object.entries(o) as [Key, Value][];
	}

	formatStringToLowerCaseWithoutSpaces(str: string) {
		return str.replaceAll(" ", "").toLowerCase();
	}
}
export default new TwitchNotificationsModule();