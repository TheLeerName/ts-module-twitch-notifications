import Module from "./index.js";
import TwitchModule from "../twitch/index.js";
import { Stream, type StreamSave } from "./stream.js";
import * as Twitch from "twitch.ts";

export type UserTypeSave = Exclude<Twitch.Helix.GetUsers.ResponseBody["data"][0]["type"], ""> | undefined;
export type BroadcasterTypeSave = Exclude<Twitch.Helix.GetUsers.ResponseBody["data"][0]["broadcaster_type"], ""> | undefined;

export interface ChannelSave {
	enabled: boolean;
	login: string;
	name: string;
	broadcasterType?: BroadcasterTypeSave;
	description?: string;
	profileImageURL: string;
	offlineImageURL?: string;
	stream: StreamSave;
}
export class Channel<_Stream extends Stream = Stream> {
	enabled: boolean = true;
	id = "";
	login = "";
	name = "";
	broadcasterType?: BroadcasterTypeSave;
	description?: string;
	profileImageURL: string;
	offlineImageURL?: string;

	streamOnlineSubIndex?: number;
	streamOfflineSubIndex?: number;

	stream: _Stream;

	constructor() {
		(this.stream as any) = new Stream(this);
	}

	/**
	 * Do not forget `data.save()` after doing this 

	 * Doesn't update `stream`, do `stream.updateFromRequest()` to update it
	 */
	async updateFromRequest(): Promise<void> {
		const result = await TwitchModule.authorization.request(Twitch.Helix.GetUsers.axiosRequest, {
			id: this.id,
		});
		if (!result.ok)
			return Module.fatalWithDisabling(`Module was disabled`, {error: `Requesting user (id: ${this.id}, login: ${this.id}) information failed: ${result.status} - ${result.message}`});

		const data = result.data[0];
		if (!data)
			return Module.log.warn(`Channel was disabled`, {causedBy: `Requesting user (id: ${this.id}, login: ${this.id}) information returned empty response (user was deleted/banned?)`});

		this.updateFromRequestData(data);
	}

	/** Do not forget `data.save()` after doing this */
	updateFromRequestData(data: Twitch.Helix.GetUsers.ResponseBody["data"][0]) {
		this.login = data.login;
		this.name = data.display_name;
		this.broadcasterType = data.broadcaster_type === "" ? undefined : data.broadcaster_type;
		this.description = data.description === "" ? undefined : data.description;
		this.profileImageURL = data.profile_image_url;
		this.offlineImageURL = data.offline_image_url === "" ? undefined : data.offline_image_url;
		return this;
	}

	fromJSON(json: ChannelSave) {
		this.enabled = json.enabled;
		this.login = json.login;
		this.name = json.name;
		this.broadcasterType = json.broadcasterType;
		this.description = json.description;
		this.profileImageURL = json.profileImageURL;
		this.offlineImageURL = json.offlineImageURL;
		this.stream.fromJSON(json.stream);
		return this;
	}

	toJSON(): ChannelSave {
		return {
			enabled: this.enabled,
			login: this.login,
			name: this.name,
			broadcasterType: this.broadcasterType,
			description: this.description,
			profileImageURL: this.profileImageURL,
			offlineImageURL: this.offlineImageURL,
			stream: this.stream.toJSON(),
		};
	}
}

export type ChannelsSave = Record<string, ChannelSave>;
export class Channels extends Map<string, Channel> {
	getByLogin(login: string): Channel | null {
		for (const channel of this.values())
			if (channel.login === login)
				return channel;
		return null;
	}

	/** Do not forget `data.save()` after doing this */
	addFromJSON(id: string, json: ChannelSave) {
		this.set(id, new Channel().fromJSON(json));
		return this;
	}

	/** Do not forget `data.save()` after doing this */
	async addFromRequestByID(id: string): Promise<Channel> {
		let channel = this.get(id);
		if (channel) {
			channel.enabled = true;
			await channel.updateFromRequest();
			return channel;
		}

		const result = await TwitchModule.authorization.request(Twitch.Helix.GetUsers.axiosRequest, {id});
		if (!result.ok)
			return Module.fatalWithDisabling(`Module was disabled`, {error: `Requesting user (id: ${id}) information failed: ${result.status} - ${result.message}`});

		const data = result.data[0];
		if (!data)
			return Module.fatalWithDisabling(`Module was disabled`, {error: `Requesting user (id: ${id}) information returned empty response (user was deleted/banned?)`});

		channel = new Channel();
		channel.id = data.id;
		channel.updateFromRequestData(data);
		this.set(id, channel);
		return channel;
	}

	/** Do not forget `data.save()` after doing this */
	async addFromRequestByLogin(login: string): Promise<Channel> {
		const result = await TwitchModule.authorization.request(Twitch.Helix.GetUsers.axiosRequest, {login});
		if (!result.ok)
			return Module.fatalWithDisabling(`Module was disabled`, {error: `Requesting user (login: ${login}) information failed: ${result.status} - ${result.message}`});

		const data = result.data[0];
		if (!data)
			return Module.fatalWithDisabling(`Module was disabled`, {error: `Requesting user (login: ${login}) information returned empty response (user was deleted/banned?)`});

		let channel = this.get(data.id);
		if (channel) {
			channel.enabled = true;
			channel.updateFromRequestData(data);
			return channel;
		}

		channel = new Channel();
		channel.id = data.id;
		channel.updateFromRequestData(data);
		this.set(data.id, channel);
		return channel;
	}

	/** Do not forget `data.save()` after doing this */
	deleteValue(channel: Channel) {
		this.delete(channel.id);
	}

	fromJSON(json: ChannelsSave) {
		for (const [id, channelSave] of Object.entries(json)) {
			const channel = new Channel();
			channel.id = id;
			channel.fromJSON(channelSave);
			this.set(id, channel);
		}
		return this;
	}

	toJSON(): ChannelsSave {
		return Object.fromEntries(Array.from(this.entries()).map(([k, v]) => [k, v.toJSON()]));
	}
}