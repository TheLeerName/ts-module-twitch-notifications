import { Stream, type StreamSave } from "./stream.js";

export interface ChannelSave {
	enabled: boolean;
	stream: StreamSave;
}
export class Channel {
	enabled: boolean = true;
	id = "";

	stream: Stream = new Stream(this);

	fromJSON(json: ChannelSave) {
		this.enabled = json.enabled;
		this.stream.fromJSON(json.stream);
		return this;
	}

	toJSON(): ChannelSave {
		return {
			enabled: this.enabled,
			stream: this.stream.toJSON(),
		};
	}
}

export type ChannelsSave = Record<string, ChannelSave>;
export class Channels extends Map<string, Channel> {
	/** Do not forget `data.save()` after doing this */
	addFromJSON(id: string, json: ChannelSave) {
		this.set(id, new Channel().fromJSON(json));
	}

	fromJSON(json: ChannelsSave) {
		for (const [id, channelSave] of Object.entries(json)) {
			const channel = new Channel();
			channel.enabled = channelSave.enabled;
			channel.id = id;
			this.set(id, channel);
		}
	}

	toJSON(): ChannelsSave {
		return Object.fromEntries(Array.from(this.entries()).map(([k, v]) => [k, v.toJSON()]));
	}
}