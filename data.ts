import Core from "../../index.js";
import { BaseData } from "../../data.js";
import TwitchModule from "../twitch/index.js";
import DiscordModule from "../discord/index.js";

import Module from "./index.js";

import { ResponseBody } from "twitch.ts";
import * as Discord from "discord.js";

export class Guild<_Stream extends Stream = Stream> {
	/** discord guild object */
	guild: Discord.Guild | undefined;
	/** is bot exists in this guild */
	enabled: boolean;
	/** discord category channel id, used for creating stream notification channels */
	categoryID: string | undefined;
	/** discord role id, used for pinging that role on stream notifications */
	roleID: string | undefined;

	twitchChannelsByTwitchChannelID: MapWithLastModifiedKeysDate<string, GuildTwitchChannel<_Stream>> = new MapWithLastModifiedKeysDate();

	constructor(guild: typeof this.guild, enabled: typeof this.enabled, categoryID: typeof this.categoryID, roleID: typeof this.roleID) {
		this.guild = guild;
		this.enabled = enabled;
		this.categoryID = categoryID;
		this.roleID = roleID;
	}

	/** is bot exists in this guild */
	isEnabled(): this is Guild.Enabled<_Stream> {
		return this.enabled;
	}
	/** is bot not exists in this guild */
	isDisabled(): this is Guild.Disabled<_Stream> {
		return !this.enabled;
	}

	enable(guild: Discord.Guild): Guild.Enabled<_Stream> {
		this.enabled = true;
		this.guild = guild;
		return this as any;
	}
	disable(): Guild.Disabled<_Stream> {
		this.enabled = false;
		this.guild = undefined;
		return this as any;
	}

	toJSON(): {
		enabled: boolean;
		categoryID?: string;
		roleID?: string;
		channels: Record<string, ReturnType<GuildTwitchChannel["toJSON"]>>;
	} {
		const json: any = {
			enabled: this.enabled,
			categoryID: this.categoryID,
			roleID: this.roleID,
			channels: {}
		};
		this.twitchChannelsByTwitchChannelID.forEach((v, k) => json.channels[k] = v.toJSON());
		return json;
	}
}
export namespace Guild {
	export interface Enabled<_Stream extends Stream = Stream> extends Guild<_Stream> {
		/** is bot exists in this guild */
		enabled: true;
		/** discord guild object */
		guild: Discord.Guild;
	}
	export interface Disabled<_Stream extends Stream = Stream> extends Guild<_Stream> {
		/** is bot exists in this guild */
		enabled: false;
		/** discord guild object */
		guild: undefined;
	}
}

export class GuildTwitchChannel<_Stream extends Stream = Stream> {
	guild: Guild | undefined;
	twitchChannel: TwitchChannel<_Stream> | undefined;

	/** is stream notifications enabled for that channel */
	enabled: boolean;

	/** discord channel object, used for posting stream notification messages */
	channel: Discord.NewsChannel | undefined;
	/** discord channel object, used for posting stream notification messages */
	channelID: string | undefined;

	/** discord message object, used for updating stream notification message */
	message: Discord.Message<true> | undefined;

	constructor(guild: typeof this.guild, twitchChannel: typeof this.twitchChannel, enabled: typeof this.enabled, channel: typeof this.channel | typeof this.channelID, message: typeof this.message) {
		this.guild = guild;
		this.twitchChannel = twitchChannel;
		this.enabled = enabled;
		if (channel) {
			if (typeof channel === "string") {
				this.channel = undefined;
				this.channelID = channel;
			}
			else {
				this.channel = channel;
				this.channelID = undefined;
			}
		}
		else {
			this.channel = undefined;
			this.channelID = undefined;
		}
		this.message = message;
	}

	/** is stream notifications enabled for that channel */
	isEnabled(): this is GuildTwitchChannel.Enabled<_Stream> {
		return this.enabled;
	}
	/** is stream notifications enabled for that channel */
	isDisabled(): this is GuildTwitchChannel.Disabled<_Stream> {
		return !this.enabled;
	}

	enable(guild: Exclude<typeof this.guild, undefined>, twitchChannel: Exclude<typeof this.twitchChannel, undefined>, channel: Discord.NewsChannel, message?: Discord.Message<true>): GuildTwitchChannel.Enabled<_Stream> {
		this.guild = guild;
		this.twitchChannel = twitchChannel;
		this.enabled = true;
		this.channel = channel;
		this.message = message;
		return this as any;
	}
	disable(): GuildTwitchChannel.Disabled<_Stream> {
		this.guild = undefined;
		this.twitchChannel = undefined;
		this.enabled = false;
		this.channelID = this.channel?.id;
		this.channel = undefined;
		this.message = undefined;
		return this as any;
	}

	toJSON(): any {
		return {
			enabled: this.enabled,
			channelID: this.channel?.id ?? this.channelID,
			messageID: this.message?.id
		};
	}
}
export namespace GuildTwitchChannel {
	export interface Enabled<_Stream extends Stream = Stream> extends GuildTwitchChannel<_Stream> {
		guild: Guild.Enabled;
		twitchChannel: TwitchChannel<_Stream>;

		enabled: true;
		channel: Discord.NewsChannel;
		channelID: undefined;
		message: Discord.Message<true> | undefined;
	}
	export interface Disabled<_Stream extends Stream = Stream> extends GuildTwitchChannel<_Stream> {
		guild: undefined;
		twitchChannel: undefined;

		enabled: false;
		channel: undefined;
		channelID: string | undefined;
		message: undefined;
	}
}

export class TwitchChannel<_Stream extends Stream = Stream> {
	/** specifies is channel banned or not, if `true` then `user` object can be outdated */
	banned: boolean;
	/** contains channel broadcaster data, for example name, avatar url; key is twitch user id */
	user: ResponseBody.GetUsers["data"][0] & {
		lastUpdatedTimestamp: number;
	};
	/** contains stream data for posting discord messages */
	stream: _Stream;
	/** event sub subscriptions ids */
	subscriptionsID: string[];
	/** key is guild id */
	guildTwitchChannels: Map<string, GuildTwitchChannel<_Stream>> = new Map();

	constructor(banned: typeof this.banned, user: typeof this.user, stream: typeof this.stream, subscriptionsID: typeof this.subscriptionsID) {
		this.banned = banned;
		this.user = user;
		this.stream = stream;
		this.subscriptionsID = subscriptionsID;
	}

	isStreamLive(): this is TwitchChannel<Stream.Live> {
		return this.stream.isLive();
	}
	changeStreamToLive(id: Exclude<typeof this.stream.id, undefined>, startedAt: Exclude<typeof this.stream.startedAt, undefined>, title: Exclude<typeof this.stream.title, undefined>, games: Exclude<typeof this.stream.games, undefined>, viewers: Exclude<typeof this.stream.viewers, undefined>): TwitchChannel<Stream.Live> {
		this.stream.changeToLive(id, startedAt, title, games, viewers);
		return this as any;
	}

	isStreamGettingVOD(): this is TwitchChannel<Stream.GettingVOD> {
		return this.stream.isGettingVOD();
	}
	changeStreamToGettingVOD(endedAt: Exclude<typeof this.stream.endedAt, undefined>, triesToGet: Exclude<typeof this.stream.triesToGet, undefined>, id?: Exclude<typeof this.stream.id, undefined>, startedAt?: Exclude<typeof this.stream.startedAt, undefined>, title?: Exclude<typeof this.stream.title, undefined>, games?: Exclude<typeof this.stream.games, undefined>, viewers?: Exclude<typeof this.stream.viewers, undefined>): TwitchChannel<Stream.GettingVOD> {
		this.stream.changeToGettingVOD(endedAt, triesToGet, id, startedAt, title, games, viewers);
		return this as any;
	}

	isStreamOffline(): this is TwitchChannel<Stream.Offline> {
		return this.stream.isOffline();
	}
	changeStreamToOffline(): TwitchChannel<Stream.Offline> {
		this.stream.changeToOffline();
		return this as any;
	}

	toJSON(): {
		banned: boolean;
		user: ResponseBody.GetUsers["data"][0] & {
			lastUpdatedTimestamp: number;
		};
		stream: ReturnType<Stream["toJSON"]>;
		subscriptionsID: string[];
	} {
		return {
			banned: this.banned,
			user: this.user,
			stream: this.stream.toJSON(),
			subscriptionsID: this.subscriptionsID
		};
	}
}

export class Stream {
	/** An ID that identifies the stream. */
	status: "offline" | "live" | "getting_vod" = "offline";
	/** An ID that identifies the stream. */
	id?: string;
	/** The UTC date and time (in RFC3339 format) of when the broadcast began. */
	startedAt?: string;
	/** The stream's title. Is an empty string if not set. */
	title?: string;
	/** The names of the category or game played. */
	games?: string[];
	/** Count of viewers */
	viewers?: number;
	/** The UTC date and time (in RFC3339 format) of when the broadcast ended. */
	endedAt?: string;
	/** tries left for getting vod data */
	triesToGet?: number;

	constructor(status: typeof this.status, id?: Exclude<typeof this.id, undefined>, startedAt?: Exclude<typeof this.startedAt, undefined>, title?: Exclude<typeof this.title, undefined>, games?: Exclude<typeof this.games, undefined>, viewers?: Exclude<typeof this.viewers, undefined>, endedAt?: Exclude<typeof this.endedAt, undefined>, triesToGet?: Exclude<typeof this.triesToGet, undefined>) {
		this.status = status;
		this.id = id;
		this.startedAt = startedAt;
		this.title = title;
		this.games = games;
		this.viewers = viewers;
		this.endedAt = endedAt;
		this.triesToGet = triesToGet;
	}

	isLive(): this is Stream.Live {
		return this.status === "live";
	}
	changeToLive(id: Exclude<typeof this.id, undefined>, startedAt: Exclude<typeof this.startedAt, undefined>, title: Exclude<typeof this.title, undefined>, games: Exclude<typeof this.games, undefined>, viewers: Exclude<typeof this.viewers, undefined>): Stream.Live {
		this.status = "live";
		this.id = id;
		this.startedAt = startedAt;
		this.title = title;
		this.games = games;
		this.viewers = viewers;
		if (this.endedAt) this.endedAt = undefined;
		if (this.triesToGet) this.triesToGet = undefined;
		return this as any;
	}

	isGettingVOD(): this is Stream.GettingVOD {
		return this.status === "getting_vod";
	}
	changeToGettingVOD(endedAt: Exclude<typeof this.endedAt, undefined>, triesToGet: Exclude<typeof this.triesToGet, undefined>, id?: Exclude<typeof this.id, undefined>, startedAt?: Exclude<typeof this.startedAt, undefined>, title?: Exclude<typeof this.title, undefined>, games?: Exclude<typeof this.games, undefined>, viewers?: Exclude<typeof this.viewers, undefined>): Stream.GettingVOD {
		this.status = "getting_vod";
		this.endedAt = endedAt;
		this.triesToGet = triesToGet;
		if (id) this.id = id;
		if (startedAt) this.startedAt = startedAt;
		if (title) this.title = title;
		if (games) this.games = games;
		if (viewers) this.viewers = viewers;
		return this as any;
	}

	isOffline(): this is Stream.Offline {
		return this.status === "offline";
	}
	changeToOffline(): Stream.Offline {
		this.status = "offline";
		this.id = undefined;
		this.startedAt = undefined;
		this.title = undefined;
		this.games = undefined;
		this.viewers = undefined;
		this.endedAt = undefined;
		this.triesToGet = undefined;
		return this as any;
	}

	toJSON(): {
		status: string;
		id?: string;
		startedAt?: string;
		title?: string;
		games?: string[];
		viewers?: number;
		endedAt?: string;
		triesToGet?: number;
	} {
		return {
			status: this.status,
			id: this.id,
			startedAt: this.startedAt,
			title: this.title,
			games: this.games,
			viewers: this.viewers,
			endedAt: this.endedAt,
			triesToGet: this.triesToGet
		}
	}
}
export namespace Stream {
	export interface Offline extends Stream {
		status: "offline";
		id: undefined;
		startedAt: undefined;
		title: undefined;
		games: undefined;
		viewers: undefined;
		endedAt: undefined;
		triesToGet: undefined;
	};
	export interface Live extends Stream {
		status: "live";
		id: string;
		startedAt: string;
		title: string;
		games: string[];
		viewers: number;
		endedAt: undefined;
		triesToGet: undefined;

		changeToGettingVOD: (endedAt: Exclude<Stream["endedAt"], undefined>, triesToGet: Exclude<Stream["triesToGet"], undefined>) => Stream.GettingVOD
	}
	export interface GettingVOD extends Stream {
		status: "live";
		id: string;
		startedAt: string;
		title: string;
		games: string[];
		viewers: number;
		endedAt: string;
		triesToGet: number;
	}
}

export interface Authorization {
	clientID: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
}

export class MapWithLastModifiedKeysDate<K, V> extends Map<K, V> {
	/** unix timestamp of when this map keys were modified */
	lastModifiedKeysTimestamp: number;
	constructor() {
		super();
		this.updateLastModifiedKeysDate();
	}

	clear() {
		const result = super.clear();
		this.updateLastModifiedKeysDate();
		return result;
	}

	delete(key: K) {
		const result = super.delete(key);
		this.updateLastModifiedKeysDate();
		return result;
	}

	set(key: K, value: V): this {
		const result = super.set(key, value);
		this.updateLastModifiedKeysDate();
		return result;
	}

	protected updateLastModifiedKeysDate() {
		this.lastModifiedKeysTimestamp = Date.now();
		return this;
	}
}

export default class ModuleData extends BaseData {
	readonly guilds: MapWithLastModifiedKeysDate<string, Guild> = new MapWithLastModifiedKeysDate();
	readonly channels: MapWithLastModifiedKeysDate<string, TwitchChannel> = new MapWithLastModifiedKeysDate();

	async initialize() {
		const json = super.getSavedFields();
		let needsSave = true;

		needsSave = !(await this.registerFieldMapAsync(json, "channels", async(saved) => {
			for (const [twitchChannelID, rawChannelData] of Object.entries<Record<string, any>>(saved)) {
				const channelData = new TwitchChannel(
					rawChannelData.banned,
					rawChannelData.user,
					new Stream(
						rawChannelData.stream.status,
						rawChannelData.stream.id,
						rawChannelData.stream.startedAt,
						rawChannelData.stream.title,
						rawChannelData.stream.games,
						rawChannelData.stream.viewers,
						rawChannelData.stream.endedAt,
						rawChannelData.stream.triesToGet
					),
					rawChannelData.subscriptionsID
				);
				await Module.updateUserData(channelData);
				this.channels.set(twitchChannelID, channelData);
			}
		}, async() => {
			const save: Record<string, any> = {};
			this.channels.forEach((v, k) => save[k] = v.toJSON());
			return save;
		}));

		needsSave = !(await this.registerFieldMapAsync(json, "guilds", async(saved) => {
			for (const [guildID, rawGuildData] of Object.entries<Record<string, any>>(saved)) {
				const guildData = new Guild(undefined, rawGuildData.enabled === true, typeof rawGuildData.categoryID === "string" ? rawGuildData.categoryID : undefined, typeof rawGuildData.roleID === "string" ? rawGuildData.roleID : undefined);
				this.guilds.set(guildID, guildData);

				try {
					guildData.guild = await DiscordModule.client.guilds.fetch(guildID);
					guildData.enabled = true;
				}
				catch(error) {
					Module.log.error("Getting discord guild failed, guild data will be disabled", {error, args: {guildID}});
					guildData.enabled = false;
					continue;
				}

				if (!guildData.enabled) continue;

				if (guildData.categoryID) {
					try {
						const channel = await guildData.guild.channels.fetch(guildData.categoryID);
						if (!channel)
							throw new Error("Not found");
						if (channel.type !== Discord.ChannelType.GuildCategory)
							throw new Error("Isn't category channel");
					}
					catch(error) {
						Module.log.error("Getting category channel failed", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, categoryID: guildData.categoryID}});
						guildData.categoryID = undefined;
					}
				}

				if (guildData.roleID) {
					try {
						const role = await guildData.guild.roles.fetch(guildData.roleID);
						if (!role)
							throw new Error("Not found");
					}
					catch(error) {
						Module.log.error("Getting role failed", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, roleID: guildData.roleID}});
						guildData.roleID = undefined;
					}
				}

				if (rawGuildData.channels) for (const [twitchChannelID, rawGuildChannelData] of Object.entries<Record<string, any>>(rawGuildData.channels)) {
					const twitchChannel = await this.getTwitchChannel(twitchChannelID);
					if (!twitchChannel) {
						Module.log.error("Getting twitch channel failed", {error: "Not found", args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, twitchChannelID}});
						continue;
					}

					const guildChannelData = new GuildTwitchChannel(guildData, twitchChannel, false, typeof rawGuildChannelData.channelID === "string" ? rawGuildChannelData.channelID : undefined, undefined);
					twitchChannel.guildTwitchChannels.set(guildID, guildChannelData);
					guildData.twitchChannelsByTwitchChannelID.set(twitchChannelID, guildChannelData);

					if (guildChannelData.channelID) {
						try {
							const c = await guildData.guild.channels.fetch(guildChannelData.channelID);
							if (!c)
								throw new Error("Not found");
							if (c.type !== Discord.ChannelType.GuildAnnouncement)
								throw new Error("Isn't news channel");
							guildChannelData.enabled = true;
							guildChannelData.channel = c;
							guildChannelData.channelID = undefined;
						}
						catch(error) {
							Module.log.error("Getting news channel failed, twitch channel will be disabled for this guild", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, twitchChannel: `${twitchChannel.user.login} (${twitchChannel.user.id})`, channelID: guildChannelData.channelID}});
							continue;
						}
					}

					if (typeof rawGuildChannelData.messageID === "string") {
						try {
							guildChannelData.message = await guildChannelData.channel!.messages.fetch(rawGuildChannelData.messageID);
						}
						catch(error) {
							Module.log.error("Caching message failed", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, twitchChannel: `${twitchChannel.user.login} (${twitchChannel.user.id})`, channel: `${guildChannelData.channel!.name} (${guildChannelData.channel!.id})`, messageID: rawGuildChannelData.messageID}});
						}
					}
				}
			}
		}, async() => {
			const save: Record<string, any> = {};
			this.guilds.forEach((v, k) => save[k] = v.toJSON());
			return save;
		}));

		if (needsSave)
			this.save();
		return this;
	}

	async getTwitchChannel(twitchChannelID: string) {
		let channelData = this.channels.get(twitchChannelID);
		if (channelData) return channelData;

		const user = await Module.getUserData(twitchChannelID);
		if (!user) return undefined;

		channelData = new TwitchChannel(false, user, new Stream("offline"), []);
		this.channels.set(twitchChannelID, channelData);
		this.save();
		return channelData;
	}

	getGuildTwitchChannel<_Stream extends Stream>(guildData: Guild.Enabled<_Stream>, channelData: TwitchChannel<_Stream>) {
		let guildChannelData = guildData.twitchChannelsByTwitchChannelID.get(channelData.user.id);
		if (guildChannelData) return guildChannelData;

		guildChannelData = new GuildTwitchChannel(guildData, channelData, false, undefined, undefined);
		guildData.twitchChannelsByTwitchChannelID.set(channelData.user.id, guildChannelData);
		channelData.guildTwitchChannels.set(guildData.guild.id, guildChannelData);
		this.save();
		return guildChannelData;
	}

	async getEnabledGuildTwitchChannel<_Stream extends Stream>(guildData: Guild.Enabled<_Stream>, channelData: TwitchChannel<_Stream>) {
		const guildChannelData = this.getGuildTwitchChannel(guildData, channelData);
		if (guildChannelData.isEnabled()) return guildChannelData;

		if (!guildData.categoryID) {
			const error = new Error("categoryID is not defined");
			Module.log.error("Creating discord channel failed", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, twitchChannel: `${channelData.user.login} (${channelData.user.id})`}});
			return error;
		}

		try {
			return guildChannelData.enable(guildData, channelData, await Module.createDiscordChannel(guildData.guild, channelData.user.login, guildData.categoryID));
		}
		catch(error) {
			Module.log.error("Creating discord channel failed", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, twitchChannel: `${channelData.user.login} (${channelData.user.id})`}});
			return error;
		}
	}

	async getGuild(guildID: string) {
		let guildData = this.guilds.get(guildID);
		if (!guildData) {
			const guild = await DiscordModule.client.guilds.fetch(guildID);
			guildData = new Guild(guild, true, undefined, undefined);
			this.guilds.set(guildID, guildData);
			this.save();
			Module.log.info("Initialized guild data", {args: {guild: `${guild.name} (${guild.id})`}});
		}
		if (guildData.isDisabled()) {
			const guild = await DiscordModule.client.guilds.fetch(guildID);
			guildData = guildData.enable(guild);
			this.save();
			Module.log.info("Enabled guild data", {args: {guild: `${guild.name} (${guild.id})`}});
		}
		return guildData as Guild.Enabled;
	}
}