import Core from "../../index.js";
import TwitchModule from "../twitch/index.js";
import DiscordModule from "../discord/index.js";
import { slashCommandGetName } from "./slash-commands/get.js";

import Module from "./index.js";
import { makeStreamOnlineMessage, makeStreamOfflineMessage, streamEndWithVOD, checkForStreamChanges, iso8601ToDecimalTime, makeThreadMessage } from "./messages.js";
import { updateState } from "./twitch-eventsub.js";
import * as Data from "./data.js";

import * as Twitch from "twitch.ts";
import * as Discord from "discord.js";

export const pollingChannelsID: string[] = [];

export let prevGetStreams: Record<string, Twitch.ResponseBody.GetStreams["data"][0]> | null = null;
let timeout: NodeJS.Timeout | null = null;
export function clearPollingTimeout() {
	if (timeout) {
		clearTimeout(timeout);
		timeout = null;
	}
}

export default async() => {
	checkAllChannels();
	DiscordModule.client.on("shard0Ready", () => checkAllChannels());
}

async function checkAllChannels() {
	const channelsID: string[] = [];
	Module.data.channels.forEach(channel => channelsID.push(channel.user.id));
	const getStreams = await getStreamsRecord(channelsID);
	for (const channelData of Module.data.channels.values()) {
		if (channelData.banned) continue;

		const getStreamsEntry = getStreams[channelData.user.id];
		if (channelData.isStreamOffline() && getStreamsEntry != null) {
			await Module.updateUserData(channelData);
			await makeStreamOnlineMessage(channelData, getStreamsEntry);
			continue;
		}
		if (channelData.isStreamLive()) {
			if (getStreamsEntry) {
				await Module.updateUserData(channelData);
				const checkForStreamChangesForGuild = checkForStreamChanges(channelData, getStreamsEntry, { game_name: channelData.stream.games[channelData.stream.games.length - 1], title: channelData.stream.title, viewer_count: channelData.stream.viewers});
				if (checkForStreamChangesForGuild) for (const guildData of Module.data.guilds.values() as MapIterator<Data.Guild<Data.Stream.Live>>) {
					if (!guildData.isEnabled()) continue;
					if (!DiscordModule.data.isSlashCommandInGuildWhitelist(slashCommandGetName, guildData.guild.id)) continue;

					const guildChannelData = await Module.data.getEnabledGuildTwitchChannel<Data.Stream.Live>(guildData, channelData);
					if (guildChannelData instanceof Error) continue;
					if (!guildChannelData.message) continue;

					let thread;
					try {
						thread = await Module.getDiscordThread(guildChannelData.message);
					}
					catch(error) {
						Module.log.error("Error occurred while starting discord thread", {error, args: {
							guild: `${guildData.guild.name} (${guildData.guild.id})`,
							channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
							messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, guildChannelData.message.id)
						}});
					}

					await checkForStreamChangesForGuild(guildChannelData, guildChannelData.message, thread);
				}
			}
			else {
				await Module.updateUserData(channelData);
				await makeStreamOfflineMessage(channelData, channelData.banned ? "Стрим окончен, потому что стример был забанен" : undefined);
			}
			continue;
		}
	}
	await skipGetStreamsPollingTimeout();
	await updateState();
}

export async function getStreamsRecord(channelsID: string[]) {
	const responseGetStreams = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetStreams, TwitchModule.authorization, channelsID, undefined, undefined, "live");
	if (!responseGetStreams.ok) {
		Module.log.error("Error occurred while getting twitch stream data", {error: responseGetStreams, args: {channelsID}});
		return {};
	}

	let cursor: string | undefined = responseGetStreams.pagination?.cursor;
	while(true) {
		if (!cursor) break;
		await new Promise(resolve => setTimeout(resolve, 500));
		const responseGetStreamsNextPage = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetStreams, TwitchModule.authorization, channelsID, undefined, undefined, "live", undefined, undefined, undefined, cursor);
		if (!responseGetStreamsNextPage.ok) {
			Module.log.error("Error occurred while getting next page of twitch stream data", {error: responseGetStreams, args: {channelsID}});
			continue;
		}

		responseGetStreams.data.push(...responseGetStreamsNextPage.data);
		cursor = responseGetStreamsNextPage.pagination?.cursor;
	}

	return arrayToRecord(responseGetStreams.data, "user_id");
}

export async function skipGetStreamsPollingTimeout() {
	clearPollingTimeout();
	await getStreamsPolling();
}

export async function getStreamsPolling() {
	if (pollingChannelsID.length > 0) {
		const getStreams = await getStreamsRecord(pollingChannelsID);
		if (prevGetStreams)
			for (const channelData of Module.data.channels.values()) {
				if (channelData.banned) continue;

				const getStreamsEntry = getStreams[channelData.user.id];
				if (channelData.isStreamLive() && getStreamsEntry != null) {
					const checkForStreamChangesForGuild = checkForStreamChanges(channelData, getStreamsEntry, prevGetStreams[channelData.user.id]);
					if (checkForStreamChangesForGuild) for (const guildData of Module.data.guilds.values() as MapIterator<Data.Guild<Data.Stream.Live>>) {
						if (!guildData.isEnabled()) continue;
						if (!DiscordModule.data.isSlashCommandInGuildWhitelist(slashCommandGetName, guildData.guild.id)) continue;

						const guildChannelData = await Module.data.getEnabledGuildTwitchChannel<Data.Stream.Live>(guildData, channelData);
						if (guildChannelData instanceof Error) continue;
						if (!guildChannelData.message) continue;

						let thread;
						try {
							thread = await Module.getDiscordThread(guildChannelData.message) ?? undefined;
						}
						catch(error) {
							Module.log.error("Error occurred while starting discord thread", {error, args: {
								guild: `${guildData.guild.name} (${guildData.guild.id})`,
								channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
								messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, guildChannelData.message.id)
							}});
						}

						await checkForStreamChangesForGuild(guildChannelData, guildChannelData.message, thread);
					}
				}
			}

		prevGetStreams = getStreams;
	}

	for (const channelData of Module.data.channels.values()) {
		if (!channelData.isStreamGettingVOD()) continue;

		channelData.stream.triesToGet--;

		const response = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetVideos, TwitchModule.authorization, {user_id: channelData.user.id}, undefined, undefined, "time", "archive", 1);
		if (!response.ok) {
			Module.log.error("Error occurred while getting twitch video data", {error: response, args: {channel: `${channelData.user.login} (${channelData.user.id})`, status: response.status, message: response.message}});
			continue;
		}
		if (response.data.length > 0) {
			const entry = response.data[0];
			if (entry?.stream_id && entry.stream_id === channelData.stream.id) {
				Module.log.info("Got VOD of stream", {dontPrintFile: true, args: {
					twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
					url: entry.url,
					title: entry.title
				}});
				const log = Module.log.verbose("Got VOD of stream", {args: {
					twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
					url: entry.url,
					title: entry.title
				}});

				channelData.stream.startedAt = entry.created_at;
				// channelData.stream.title = entry.title; i dont like that twitch uses first title of stream
				channelData.stream.endedAt = new Date(new Date(entry.created_at).getTime() + iso8601ToDecimalTime(entry.duration)).toISOString();

				for (let guildChannelData of channelData.guildTwitchChannels.values()) {
					if (!guildChannelData.isEnabled()) continue;
					if (!DiscordModule.data.isSlashCommandInGuildWhitelist(slashCommandGetName, guildChannelData.guild.guild.id)) continue;

					const guildData = guildChannelData.guild;
					if (!guildData.isEnabled()) continue;

					if (guildChannelData.message)
						guildChannelData.message = await Core.tasks.queue<Discord.OmitPartialGroupDMChannel<Discord.Message<true>>>(`discordmessage_${guildChannelData.message.id}_edit`, signal => new Promise((resolve, reject) => {
							signal.addEventListener("abort", _ => reject());
							guildChannelData.message!.edit(streamEndWithVOD(guildChannelData, entry)).then(resolve).catch(reject);
						}));
					else
						guildChannelData.message = await Core.tasks.queue<Discord.Message<true>>(`discordchannel_${guildChannelData.channel.id}_send`, signal => new Promise((resolve, reject) => {
							signal.addEventListener("abort", _ => reject());
							guildChannelData.channel.send(streamEndWithVOD(guildChannelData, entry)).then(resolve).catch(reject);
						}));
					guildChannelData.channel = guildChannelData.message.channel as Discord.NewsChannel;

					try {
						const thread = await Module.getDiscordThread(guildChannelData.message);

						try {
							let message = (await Core.tasks.queue<Discord.Collection<string, Discord.Message<true>>>(`channel_${thread.id}_messageFetch1`, signal => new Promise((resolve, reject) => {
								signal.addEventListener("abort", _ => reject());
								thread.messages.fetch({limit: 1}).then(resolve).catch(reject);
							}))).last();
							if (!message)
								throw new Error("Not found");
							message = await Core.tasks.queue<Discord.Message<true>>(`message_${message.id}_edit`, signal => new Promise((resolve, reject) => {
								signal.addEventListener("abort", _ => reject());
								message!.edit(makeThreadMessage(":red_circle: Стрим окончен", channelData.stream.endedAt)).then(resolve).catch(reject);
							}));
						}
						catch(error) {
							Module.log.error("Changing timestamp of stream ended thread message failed", {error, args: {
								guild: `${guildData.guild.name} (${guildData.guild.id})`,
								twitchChannel: `${channelData.user.login} (${channelData.user.id})`
							}});
						}

						await Core.tasks.queue(`channel_${thread.id}_send`, signal => new Promise((resolve, reject) => {
							signal.addEventListener("abort", _ => reject());
							thread.send(makeThreadMessage(":vhs: Получена запись стрима")).then(resolve).catch(reject);
						}));
					}
					catch(error) {
						Module.log.error("Error occurred while starting discord thread", {error, args: {
							guild: `${guildData.guild.name} (${guildData.guild.id})`,
							channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
							messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, guildChannelData.message.id)
						}});
					}

					guildChannelData.message = undefined;
				}
				channelData.changeStreamToOffline();
				Module.data.save();
			}
		}
		else if (channelData.stream.triesToGet < 0) {
			Module.log.info("Failed to get VOD of stream because tries are over", {dontPrintFile: true, args: {
				twitchChannel: `${channelData.user.login} (${channelData.user.id})`
			}});
			const log = Module.log.verbose("Failed to get VOD of stream because tries are over", {args: {
				twitchChannel: `${channelData.user.login} (${channelData.user.id})`
			}});

			for (let guildChannelData of channelData.guildTwitchChannels.values()) {
				if (!guildChannelData.isEnabled()) continue;
				if (!DiscordModule.data.isSlashCommandInGuildWhitelist(slashCommandGetName, guildChannelData.guild.guild.id)) continue;

				const guildData = guildChannelData.guild;
				if (!guildData.isEnabled()) continue;

				if (guildChannelData.message) {
					try {
						const thread = await Module.getDiscordThread(guildChannelData.message);
						await Core.tasks.queue(`discordchannel_${thread.id}_send`, signal => new Promise((resolve, reject) => {
							signal.addEventListener("abort", _ => reject());
							thread.send(makeThreadMessage(":x: Запись стрима не была найдена, возможно были скрыты стримером")).then(resolve).catch(reject);
						}));
					}
					catch(error) {
						Module.log.error("Error occurred while starting discord thread", {error, args: {
							guild: `${guildData.guild.name} (${guildData.guild.id})`,
							channel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`,
							messageLink: Module.makeDiscordMessageLink(guildData.guild.id, guildChannelData.channel.id, guildChannelData.message.id)
						}});
					}
				}
			}
			channelData.changeStreamToOffline();
			Module.data.save();
		}
	}

	timeout = setTimeout(getStreamsPolling, 5000);
}

function arrayToRecord<T extends {}>(array: T[], key: string): Record<string, T> {
	const record: Record<string, T> = {};
	for (const entry of array) (record as any)[Reflect.get(entry, key)] = entry;
	return record;
}