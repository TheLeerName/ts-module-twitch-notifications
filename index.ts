import * as Core from "../../index.js";
import { Module as TwitchModule } from "../twitch/index.js";
import Data from "./data.js";
import { Channel, Channels } from "./channel.js";
import type { Stream, StreamLive, StreamGettingVOD } from "./stream.js";
import Polling from "./polling.js";

import * as Twitch from "twitch.ts";
import EventEmitter from "node:stream";

export interface Events {
	online: (channel: Channel<StreamLive>) => void;
	progress: (channel: Channel<StreamLive>) => void;
	progress_changed_entries: (channel: Channel<StreamLive>, entryNames: Awaited<ReturnType<Stream["updateFromRequest"]>>) => void;
	offline: (channel: Channel<StreamGettingVOD>) => void;
	vod_found: (channel: Channel<StreamGettingVOD>, vodURL: string) => void;
	vod_no_more_tries: (channel: Channel<StreamGettingVOD>) => void;
}

export class Module extends EventEmitter implements Core.IModule {
	readonly initializeBefore = ["twitch"];
	readonly name = "twitch-notifications" as const;
	readonly data!: Data;
	readonly core!: Core.Core;
	readonly log!: Core.ModuleLogFunctions;
	readonly twitch!: TwitchModule;

	readonly channels = new Channels();
	readonly polling = new Polling();

	readonly TRIES_TO_GET = 360;

	async initialize() {
		//throw new Error("nope.");

		const twitch = Core.default.modules.getInstance<TwitchModule>(this.twitch.name);
		if (twitch == null) return;

		Core.default.modules.setReadonlyFields(this, {
			data: new Data(this),
			core: Core.default,
			log: Core.default.log.makeFunctions(this.name),
			twitch,
		});
		this.data.initialize();

		this.twitch
			.once("initialized", () => this.onTwitchInitialized());
		this.twitch.ws
			.on("stream.online", message => this.onStreamOnline(message))
			.on("stream.offline", message => this.onStreamOffline(message));
	}

	async fatalWithDisabling(msg: any, options?: Parameters<typeof this.log.fatal>[1]) {
		this.data.disabled = true;
		await this.data.save();
		return this.log.fatal(msg, options);
	}

	/** Do not forget `data.save()` after doing this */
	async addChannelByLogin(login: string) {
		const channel = await this.channels.addFromRequestByLogin(login);

		await this.twitch.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {broadcaster_user_id: channel.id});
		channel.streamOnlineSubIndex = this.twitch.ws.subscriptions.length - 1;
		await this.twitch.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {broadcaster_user_id: channel.id});
		channel.streamOnlineSubIndex = this.twitch.ws.subscriptions.length - 1;

		await channel.stream.updateFromRequest();
		if (channel.stream.isLive())
			this.emit("online", channel as Channel<StreamLive>);

		return channel;
	}

	/** Do not forget `data.save()` after doing this */
	async removeChannelByLogin(login: string) {
		const channel = this.channels.getByLogin(login);
		if (!channel) return;
		channel.enabled = false;
		//this.channels.deleteValue(channel);

		if (channel.streamOnlineSubIndex)
			await this.twitch.ws.unsubscribeFromEvent(channel.streamOnlineSubIndex);
		if (channel.streamOfflineSubIndex)
			await this.twitch.ws.unsubscribeFromEvent(channel.streamOfflineSubIndex);
	}

	protected mults: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
	/** converts from ISO 8601 format to milliseconds, doesnt support months and greater */
	iso8601ToDecimalTime(duration: string): number {
		var seconds = 0;
		while(true) {
			const part = parseInt(duration);
			duration = duration.substring(`${part}`.length);
			if (!isNaN(part)) seconds += part * (this.mults[duration.charAt(0)] ?? 1);
			else return seconds * 1000;
			duration = duration.substring(1);
		}
	}

	protected async onTwitchInitialized() {
		for (const [id, channel] of this.channels) {
			await this.twitch.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {broadcaster_user_id: id});
			await this.twitch.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {broadcaster_user_id: id});

			const prevStatus = channel.stream.status;
			await channel.stream.updateFromRequest();
			if (channel.stream.isLive() && prevStatus === "offline")
				this.emit("online", channel as Channel<StreamLive>);
			if (channel.stream.isGettingVOD() && prevStatus === "live")
				this.emit("offline", channel as Channel<StreamGettingVOD>);
		}
		this.polling.runOrStop();
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
		this.polling.run();
	}
	protected async onStreamOffline(message: Twitch.EventSub.StreamOffline.MessageNotification) {
		const event = message.payload.event;
		const channel = this.channels.get(event.broadcaster_user_id);
		if (!channel) return;

		await channel.stream.updateFromRequest();
		if (!channel.stream.isGettingVOD())
			return this.fatalWithDisabling(`Module was disabled`, {error: `channels["${channel.id}"].stream.status is not "getting_vod"`});
		this.emit("offline", channel as Channel<StreamGettingVOD>);
		this.polling.runOrStop();
	}

	override once<EventName extends keyof Events>(eventName: EventName, listener: Events[EventName]) {
		return super.once(eventName, listener);
	}
	override prependOnceListener<EventName extends keyof Events>(eventName: EventName, listener: Events[EventName]) {
		return super.prependOnceListener(eventName, listener);
	}
	override on<EventName extends keyof Events>(eventName: EventName, listener: Events[EventName]) {
		return super.on(eventName, listener);
	}
	override prependListener<EventName extends keyof Events>(eventName: EventName, listener: Events[EventName]) {
		return super.prependListener(eventName, listener);
	}
	override off<EventName extends keyof Events>(eventName: EventName, listener: Events[EventName]) {
		return super.off(eventName, listener);
	}
	override emit<EventName extends keyof Events>(eventName: EventName, ...args: Parameters<Events[EventName]>) {
		return super.emit(eventName, ...args);
	}
}
export default new Module();

export * from "./channel.js";
export * from "./stream.js";