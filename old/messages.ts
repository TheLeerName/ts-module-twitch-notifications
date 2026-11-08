import Core from "../../index.js";
import DiscordModule from "../discord/index.js";
import Module from "./index.js";
import * as Data from "./data.js";
import { pollingChannelsID } from "./twitch-polling.js";
import { slashCommandGetName } from "./slash-commands/get.js";

import * as Discord from "discord.js";
import { ResponseBody } from "twitch.ts";

const twitchIcon = "https://pngimg.com/d/twitch_PNG13.png";
export const textMap = {
	discordChannelNameOffline: `『⚫』%1`,
	discordChannelNameLive: `『🔴』%1`,
	discordChannelTopic: "Каждое сообщение обновляется самописным ботом! Если в названии канала кружок красный, это значит канал сейчас в эфире!"
};

export async function makeStreamOnlineMessage(_channelData: Data.TwitchChannel<Data.Stream.Offline>, entry: ResponseBody.GetStreams["data"][0]) {
	const channelData = _channelData.changeStreamToLive(entry.id, entry.started_at, entry.title, [entry.game_name], entry.viewer_count);

	if (!pollingChannelsID.includes(channelData.user.id))
		pollingChannelsID.push(channelData.user.id);

	Module.log.info("Stream started", {dontPrintFile: true, args: {
		twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
		twitchStream: `${entry.title} (${entry.id})`,
		twitchStreamGame: entry.game_name
	}});
	const log = Module.log.verbose("Making stream online message", {args: {
		twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
		twitchStream: `${entry.title} (${entry.id})`,
		twitchStreamGame: entry.game_name
	}});

	const checkForStreamChangesForGuild = checkForStreamChanges(channelData, entry, null);
	for (const guildData of Module.data.guilds.values() as MapIterator<Data.Guild<Data.Stream.Live>>) {
		if (!guildData.isEnabled()) continue;
		if (!DiscordModule.slashCommands.isCommandInGuildAllowed(slashCommandGetName, guildData.guild.id)) continue;

		const guildChannelData = await Module.data.getEnabledGuildTwitchChannel<Data.Stream.Live>(guildData, channelData);
		if (guildChannelData instanceof Error) continue;

		const messageContent: Discord.MessageCreateOptions = streamLive(guildChannelData, entry);
		let message;
		try {
			message = await Core.tasks.queue<Discord.Message<true>>(`discordchannel_${guildChannelData.channel.id}_send`, signal => new Promise((resolve, reject) => {
				signal.addEventListener("abort", _ => reject());
				guildChannelData.channel.send(messageContent).then(resolve).catch(reject);
			}));
		}
		catch(error) {
			Module.log.error("Error occurred while posting discord message", {error, args: {guild: `${guildData.guild.name} (${guildData.guild.id})`, channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`}});
			continue;
		}
		guildChannelData.message = message;

		await Core.tasks.queue(`discordchannel_${guildChannelData.channel.id}_setName`, signal => new Promise((resolve, reject) => {
			signal.addEventListener("abort", _ => reject());
			guildChannelData.channel.setName(textMap.discordChannelNameLive.replaceAll("%1", channelData.user.login)).then(resolve).catch(reject);
		}));

		let thread;
		try {
			thread = await Module.getDiscordThread(message);
		}
		catch(error) {
			Module.log.error("Error occurred while starting discord thread", {error, args: {
				guild: `${guildData.guild.name} (${guildData.guild.id})`,
				channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
				messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, message.id)
			}});
		}

		checkForStreamChangesForGuild?.(guildChannelData, guildChannelData.message, thread);

		message.crosspost().catch(error => {
			Module.log.error("Error occurred while publishing discord message", {error, args: {
				guild: `${guildData.guild.name} (${guildData.guild.id})`,
				channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
				messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, message.id)
			}});
		});
	}
	Module.data.save();
}

export async function makeStreamOfflineMessage(channelData: Data.TwitchChannel<Data.Stream.Live>, streamEndedMessage?: string) {
	const endedAt = new Date().toISOString();

	Module.log.info("Stream ended", {dontPrintFile: true, args: {
		twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
		twitchStream: `${channelData.stream.title} (${channelData.stream.id})`,
		twitchStreamGames: channelData.stream.games.join(", ")
	}});
	const log = Module.log.verbose("Making stream offline message", {args: {
		twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
		twitchStream: `${channelData.stream.title} (${channelData.stream.id})`,
		twitchStreamGames: channelData.stream.games.join(", ")
	}});

	if (pollingChannelsID.includes(channelData.user.id))
		pollingChannelsID.splice(pollingChannelsID.indexOf(channelData.user.id), 1);

	for (const guildData of Module.data.guilds.values() as MapIterator<Data.Guild<Data.Stream.Live>>) {
		if (!guildData.isEnabled()) continue;
		if (!DiscordModule.slashCommands.isCommandInGuildAllowed(slashCommandGetName, guildData.guild.id)) continue;

		const guildChannelData = await Module.data.getEnabledGuildTwitchChannel<Data.Stream.Live>(guildData, channelData);
		if (guildChannelData instanceof Error) continue;


		if (guildChannelData.message) {
			const m = streamEnd(guildChannelData, endedAt);
			await Core.tasks.queue(`discordmessage_${guildChannelData.message.id}_edit`, signal => new Promise((resolve, reject) => {
				signal.addEventListener("abort", _ => reject());
				guildChannelData.message!.edit(m).then(resolve).catch(reject);
			}));
		}
		else
			guildChannelData.message = await Core.tasks.queue<Discord.Message<true>>(`discordchannel_${guildChannelData.channel.id}_send`, signal => new Promise((resolve, reject) => {
				signal.addEventListener("abort", _ => reject());
				guildChannelData.channel.send(streamEnd(guildChannelData, endedAt)).then(resolve).catch(reject);
			}));

		guildChannelData.channel = await Core.tasks.queue(`channel_${guildChannelData.channel.id}_setName`, signal => new Promise((resolve, reject) => {
			signal.addEventListener("abort", _ => reject());
			guildChannelData.channel.setName(textMap.discordChannelNameOffline.replaceAll("%1", channelData.user.login)).then(resolve).catch(reject);
		}));

		try {
			const thread = await Module.getDiscordThread(guildChannelData.message);
			await Core.tasks.queue(`channel_${thread.id}_send`, signal => new Promise((resolve, reject) => {
				signal.addEventListener("abort", _ => reject());
				thread.send(makeThreadMessage(`:red_circle: ${streamEndedMessage ? streamEndedMessage : "Стрим окончен"}`, channelData.stream.endedAt)).then(resolve).catch(reject);
			}));
		}
		catch(error) {
			Module.log.error("Error occurred while starting discord thread", {error, args: {
				guild: `${guildData.guild.name} (${guildData.guild.id})`,
				channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
				messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, guildChannelData.message.id)
			}});
			continue;
		}
	}

	channelData.changeStreamToGettingVOD(endedAt, 360);
	Module.data.save();
}

export function makeThreadMessage(message: string, date?: string) {
	return `<t:${Math.floor((new Date(date ?? Date.now())).getTime() / 1000)}:t> | ${message}`;
}

const trackStreamFields = [
	// [entryName, emoji, displayName]
	["title", "speech_left", "Название стрима"],
	["game_name", "video_game", "Текущая игра"],
	["viewer_count", "bust_in_silhouette", "Зрителей"]
] as const satisfies [keyof ResponseBody.GetStreams["data"][0], string, string][];
export function checkForStreamChanges(channelData: Data.TwitchChannel<Data.Stream.Live>, entry: ResponseBody.GetStreams["data"][0], prevEntry: Pick<ResponseBody.GetStreams["data"][0], typeof trackStreamFields[number]["0"]> | null): ((guildChannelData: Data.GuildTwitchChannel.Enabled<Data.Stream.Live>,message: Discord.Message<true>, thread?: Discord.AnyThreadChannel) => Promise<void>) | null {
	const threadMessagesContent: string[] = [];
	for (const [entryName, emoji, displayName] of trackStreamFields) {
		let value: any = entry[entryName] ?? null;
		const prevValue: any = prevEntry != null ? Reflect.get(prevEntry, entryName) ?? null : null;
		if (value != null) {
			if (value != prevValue) {
				let valueDisplay = `${value}`;
				if (entryName === "game_name")
					valueDisplay = translateToRU_gameName(valueDisplay);

				if (prevEntry != null) {
					if (entryName === "game_name") {
						channelData.stream.games.push(value);
						Module.data.save();
					}
					else if (entryName === "title") {
						channelData.stream.title = value;
						Module.data.save();
					}
					else if (entryName === "viewer_count") {
						channelData.stream.viewers = value;
						Module.data.save();
					}
				}

				const threadContent = makeThreadMessage(`:${emoji}: ${displayName}: **${valueDisplay}**`);
				Module.log.info(`Got changed entry!`, {args: {twitchChannel: `${channelData.user.display_name} (${channelData.user.id})`, entryName, prevValue, newValue: value, threadContent}});
				threadMessagesContent.push(threadContent);
			}
		} else {
			const reason = [];
			if (prevValue == null) reason.push("prevValue");
			if (value == null) reason.push("value");
			Module.log.error(`Can't compare previous value and new value`, {args: {twitchChannel: `${channelData.user.login} (${channelData.user.id})`, reason: `${reason.join(", ")} is null`}})
		}
	}

	return threadMessagesContent.length === 0 ? null : async(guildChannelData, message, thread) => {
		const messageContent = streamLive(guildChannelData, entry);
		try {
			await Core.tasks.queue(`message_${message.id}_edit`, signal => new Promise((resolve, reject) => {
				signal.addEventListener("abort", _ => reject());
				message.edit(messageContent).then(resolve).catch(reject);
			}));
		}
		catch(error) {
			Module.log.error("Error occurred while editing message", {error, args: {
				guild: `${guildChannelData.guild.guild.name} (${guildChannelData.guild.guild.id})`,
				channel: `#${guildChannelData.message?.channel.name} (${guildChannelData.message?.channel.id})`,
				messageID: guildChannelData.message?.id,
				messageContent
			}});
		}

		for (const threadContent of threadMessagesContent) {
			if (thread) {
				try {
					await Core.tasks.queue(`channel_${thread.id}_send`, signal => new Promise((resolve, reject) => {
						signal.addEventListener("abort", _ => reject());
						thread.send(threadContent).then(resolve).catch(reject);
					}));
				}
				catch(error) {
					Module.log.error("Error occurred while sending thread message", {error, args: {
						guild: `${guildChannelData.guild.guild.name} (${guildChannelData.guild.guild.id})`,
						channel: `#${thread.parent} (${guildChannelData.message?.channel.id})`, messageID: guildChannelData.message?.id,
						threadContent
					}});
				}
			}
		}
	};
}

function streamLive(guildChannelData: Data.GuildTwitchChannel.Enabled<Data.Stream.Live>, entry: ResponseBody.GetStreams["data"][0]) {
	const url = `https://twitch.tv/${guildChannelData.twitchChannel.user.login}`;

	return {content: guildChannelData.guild.roleID ? `<@&${guildChannelData.guild.roleID}>`: "", embeds: [new Discord.EmbedBuilder()
	.setAuthor({
		name: `${guildChannelData.twitchChannel.user.display_name} в эфире на Twitch!`,
		url: url,
		iconURL: twitchIcon
	})
	.setTitle(guildChannelData.twitchChannel.stream.title)
	.setURL(url)
	.setDescription(`${guildChannelData.twitchChannel.user.description.length > 0 ? `${guildChannelData.twitchChannel.user.description}\n\n` : ""}${url}\n\n**Желаем вам приятного просмотра!**\n`)
	.addFields(
		{
			name: "Игры",
			value: gamesToHumanReadable(guildChannelData.twitchChannel.stream.games),
			inline: false
		},
		{
			name: "Стрим был начат",
			value: `<t:${Math.floor(new Date(guildChannelData.twitchChannel.stream.startedAt).getTime() / 1000)}:R>`,
			inline: true
		},
		{
			name: "Зрителей",
			value: `${entry.viewer_count}`,
			inline: true
		}
	)
	.setImage(`${entry.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")}?v=${Math.random()}`)
	.setThumbnail(guildChannelData.twitchChannel.user.profile_image_url)
	.setColor([100, 64, 165])]};
}

function streamEnd(guildChannelData: Data.GuildTwitchChannel.Enabled<Data.Stream.Live>, endedAt: string) {
	const url = `https://twitch.tv/${guildChannelData.twitchChannel.user.login}`;

	const msg = {content: guildChannelData.guild.roleID ? `<@&${guildChannelData.guild.roleID}>`: "", embeds: [new Discord.EmbedBuilder()
	.setAuthor({
		name: `Стрим на Twitch от ${guildChannelData.twitchChannel.user.display_name} был завершён`,
		url: url,
		iconURL: twitchIcon,
	})
	.setTitle(guildChannelData.twitchChannel.stream.title)
	.setURL(url)
	.setDescription(`${guildChannelData.twitchChannel.user.description.length > 0 ? `${guildChannelData.twitchChannel.user.description}\n\n` : ""}${url}`)
	.addFields(
		{
			name: "Игры",
			value: gamesToHumanReadable(guildChannelData.twitchChannel.stream.games, false),
			inline: false
		},
		{
			name: "Длительность",
			value: decimalTimeToHumanReadable(new Date(endedAt).getTime() - new Date(guildChannelData.twitchChannel.stream.startedAt).getTime()),
			inline: true
		}
	)
	.setThumbnail(guildChannelData.twitchChannel.user.profile_image_url)
	.setColor([100, 64, 165])]};
	if (guildChannelData.twitchChannel.user.offline_image_url.length > 0) msg.embeds[0].setImage(guildChannelData.twitchChannel.user.offline_image_url);
	return msg;
}

export function streamEndWithVOD(guildChannelData: Data.GuildTwitchChannel.Enabled<Data.Stream.GettingVOD>, entry: ResponseBody.GetVideos["data"][0]) {
	const url = entry.url;

	const msg = {content: guildChannelData.guild.roleID ? `<@&${guildChannelData.guild.roleID}>`: "", embeds: [new Discord.EmbedBuilder()
	.setAuthor({
		name: `Запись стрима на Twitch от ${guildChannelData.twitchChannel.user.display_name}`,
		url: url,
		iconURL: twitchIcon,
	})
	.setTitle(guildChannelData.twitchChannel.stream.title)
	.setURL(url)
	.setDescription(`${guildChannelData.twitchChannel.user.description.length > 0 ? `${guildChannelData.twitchChannel.user.description}\n\n` : ""}${url}\n\n**Желаем вам приятного просмотра!**`)
	.addFields(
		{
			name: "Игры",
			value: gamesToHumanReadable(guildChannelData.twitchChannel.stream.games, false),
			inline: false
		},
		{
			name: "Длительность",
			value: decimalTimeToHumanReadable(new Date(guildChannelData.twitchChannel.stream.endedAt).getTime() - new Date(guildChannelData.twitchChannel.stream.startedAt).getTime()),
			inline: true
		},
		{
			name: "Удаление записи",
			value: `<t:${Math.floor(new Date(new Date(guildChannelData.twitchChannel.stream.endedAt).getTime() + getVODSavingTime(guildChannelData.twitchChannel.user.broadcaster_type)).getTime() / 1000)}:R>`,
			inline: true
		}
	)
	.setThumbnail(guildChannelData.twitchChannel.user.profile_image_url)
	.setColor([100, 64, 165])]};
	if (guildChannelData.twitchChannel.user.offline_image_url.length > 0) msg.embeds[0].setImage(guildChannelData.twitchChannel.user.offline_image_url);
	return msg;
}

function translateToRU_gameName(gameName: string): string {
	switch(gameName) {
		case "": return "Без категории";
		case "Just Chatting": return "Общение";
		case "Games + Demos": return "Игры и Демо";
		case "Politics": return "Политика";
		case "Art": return "Искусство";
		case "Music": return "Музыка";
		case "DJs": return "Диджеи";
		case "Talk Shows & Podcasts": return "Ток-шоу и подкасты";
		case "Special Events": return "Мероприятия";
		case "Animals, Aquariums, and Zoos": return "Животные, аквариумы и зоопарки";
		default: return gameName;
	}
}

function gamesToHumanReadable(arr: string[], lastToBeChoosed: boolean = true): string {
	var str = "";
	if (lastToBeChoosed) {
		if (arr.length > 1) {
			str += arr.slice(0, arr.length - 1).map(translateToRU_gameName).join("\n");
			str += "-> **" + translateToRU_gameName(arr[arr.length - 1]) + "**";
		}
		else
			str = translateToRU_gameName(arr[0]);
	} else {
		str += arr.map(translateToRU_gameName).join("\n");
	}
	return str;
}

function decimalTimeToHumanReadable(decimal: number): string {
	decimal /= 1000;
	var h = Math.floor(decimal / 3600) + "";
	var m = Math.floor((decimal % 3600) / 60) + "";
	var s = Math.floor(decimal % 60) + "";
	return (h.length < 2 ? "0" + h : h) + ":" + (m.length < 2 ? "0" + m : m) + ":" + (s.length < 2 ? "0" + s : s);
}

const mults: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
/** converts from ISO 8601 format to milliseconds, doesnt support months and greater */
export function iso8601ToDecimalTime(duration: string): number {
	var seconds = 0;
	while(true) {
		const part = parseInt(duration);
		duration = duration.substring(`${part}`.length);
		if (!isNaN(part)) seconds += part * (mults[duration.charAt(0)] ?? 1);
		else return seconds * 1000;
		duration = duration.substring(1);
	}
}

function getVODSavingTime(broadcasterType: ResponseBody.GetUsers["data"][0]["broadcaster_type"]): number {
	switch(broadcasterType) {
		case "partner":   return 5184000000; // 60 days in ms
		case "affiliate": return 1209600000; // 14 days in ms
		case "":          return 604800000;  // 7 days in ms
	}
}