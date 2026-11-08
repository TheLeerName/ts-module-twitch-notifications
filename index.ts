import Core from "../../index.js";
import TwitchModule from "../twitch/index.js";
import Data from "./data.js";
import { Channel, Channels } from "./channel.js";
import type { Stream, StreamLive, StreamGettingVOD } from "./stream.js";
import Polling from "./polling.js";

import * as Twitch from "twitch.ts";
import EventEmitter from "node:stream";

export interface TwitchNotificationsEvents {
	online: (channel: Channel<StreamLive>) => void;
	progress: (channel: Channel<StreamLive>) => void;
	progress_changed_entries: (channel: Channel<StreamLive>, entryNames: Awaited<ReturnType<Stream["updateFromRequest"]>>) => void;
	offline: (channel: Channel<StreamGettingVOD>) => void;
	vod_found: (channel: Channel<StreamGettingVOD>, vodURL: string) => void;
	vod_no_more_tries: (channel: Channel<StreamGettingVOD>) => void;
}

export class TwitchNotificationsModule extends EventEmitter {
	readonly name = "twitch-notifications" as const;
	readonly data: Data;
	readonly log = Core.log.makeFunctions(this.name);

	readonly channels = new Channels();
	readonly polling = new Polling();

	readonly TRIES_TO_GET = 360;

	constructor() {
		super();
		this.data = new Data(this).initialize();

		TwitchModule
			.once("initialized", () => this.onTwitchInitialized());
		TwitchModule.ws
			.on("stream.online", message => this.onStreamOnline(message))
			.on("stream.offline", message => this.onStreamOffline(message));
	}

	isDisabled() {
		return this.data.disabled;
	}

	async fatalWithDisabling(msg: any, options?: Parameters<typeof this.log.fatal>[1]) {
		this.data.disabled = true;
		await this.data.save();
		return this.log.fatal(msg, options);
	}

	/** Do not forget `data.save()` after doing this */
	async addChannelByLogin(login: string) {
		const channel = await this.channels.addFromRequestByLogin(login);
		//await TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {broadcaster_user_id: channel.id});
		//channel.streamOnlineSubIndex = TwitchModule.ws.subscriptions.length - 1;
		//await TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {broadcaster_user_id: channel.id});
		//channel.streamOnlineSubIndex = TwitchModule.ws.subscriptions.length - 1;

		return channel;
	}

	/** Do not forget `data.save()` after doing this */
	async removeChannelByLogin(login: string) {
		const channel = this.channels.getByLogin(login);
		if (!channel) return;
		channel.enabled = false;
		//this.channels.deleteValue(channel);

		//if (channel.streamOnlineSubIndex)
		//	await TwitchModule.ws.unsubscribeFromEvent(channel.streamOnlineSubIndex);
		//if (channel.streamOfflineSubIndex)
		//	await TwitchModule.ws.unsubscribeFromEvent(channel.streamOfflineSubIndex);
	}

	protected async onTwitchInitialized() {
		//for (const [id, channel] of this.channels) {
			//await TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {broadcaster_user_id: id});
			//await TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {broadcaster_user_id: id});
			//await channel.stream.updateFromRequest();
		//}
		/*console.log(JSON.stringify(await TwitchModule.authorization.request.withRefreshing(Twitch.Helix.GetUsers.axiosRequest, {
			login: "tham"
		})));*/
		/*this.channels.addFromJSON("1", {
			enabled: true,
			stream: { status: "offline" }
		});*/
		//this.data.save();
		/*console.log(JSON.stringify(this.channels.toJSON()));
		this.channels.get("1")!.stream.setLive({
			id: "2",
			startedAt: "2",
			title: "hi",
			games: ["Overwatch"],
			viewers: 67
		});
		console.log(JSON.stringify(this.channels.toJSON()));
		this.channels.get("1")!.stream.setGettingVOD({
			endedAt: "3",
			triesToGet: 360,
		});
		console.log(JSON.stringify(this.channels.toJSON()));
		await this.data.save();*/
		/*TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {
			broadcaster_user_id: "",
		});
		TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {
			broadcaster_user_id: "",
		});*/
	}

	protected async onStreamOnline(message: Twitch.EventSub.StreamOnline.MessageNotification) {
		const event = message.payload.event;
		if (event.type !== "live") return;
		const channel = this.channels.get(event.broadcaster_user_id);
		if (!channel) return;

		await channel.stream.updateFromRequest();
		if (!channel.stream.isLive())
			return this.fatalWithDisabling(`Module was disabled`, {error: `channels["${channel.id}"].stream.status is not "live"`});
		this.emit("online", channel as Channel<StreamLive>);
		//this.polling.run();
	}
	protected async onStreamOffline(message: Twitch.EventSub.StreamOffline.MessageNotification) {
		const event = message.payload.event;
		const channel = this.channels.get(event.broadcaster_user_id);
		if (!channel) return;

		await channel.stream.updateFromRequest();
		if (!channel.stream.isGettingVOD())
			return this.fatalWithDisabling(`Module was disabled`, {error: `channels["${channel.id}"].stream.status is not "getting_vod"`});
		this.emit("offline", channel as Channel<StreamGettingVOD>);
		//this.polling.runOrStop();
	}

	override once<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, listener: TwitchNotificationsEvents[EventName]) {
		return super.once(eventName, listener);
	}
	override prependOnceListener<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, listener: TwitchNotificationsEvents[EventName]) {
		return super.prependOnceListener(eventName, listener);
	}
	override on<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, listener: TwitchNotificationsEvents[EventName]) {
		return super.on(eventName, listener);
	}
	override prependListener<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, listener: TwitchNotificationsEvents[EventName]) {
		return super.prependListener(eventName, listener);
	}
	override off<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, listener: TwitchNotificationsEvents[EventName]) {
		return super.off(eventName, listener);
	}
	override emit<EventName extends keyof TwitchNotificationsEvents>(eventName: EventName, ...args: Parameters<TwitchNotificationsEvents[EventName]>) {
		return super.emit(eventName, ...args);
	}
}
export default new TwitchNotificationsModule();

export * from "./channel.js";
export * from "./stream.js";