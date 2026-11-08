import Module from "./index.js";
import TwitchModule from "../twitch/index.js";
import type { Channel } from "./channel.js";
import * as Twitch from "twitch.ts";

export interface StreamSave {
	status: "offline" | "live" | "getting_vod";
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
}

export class Stream {
	/** Set this with `setLive()` */
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
	/** A URL to an image of a frame from the last 5 minutes of the stream. Replace the width and height placeholders in the URL ({width}x{height}) with the size of the image you want, in pixels. */
	thumbnailURL?: string;
	/** The UTC date and time (in RFC3339 format) of when the broadcast ended. */
	endedAt?: string;
	/** tries left for getting vod data */
	triesToGet?: number;

	readonly parent: Channel;
	constructor(parent: Channel) {
		this.parent = parent;
	}

	/** Do not forget `data.save()` after doing this */
	async updateFromRequest() {
		const changedEntries: (keyof Pick<Stream, "title" | "games" | "viewers" | "thumbnailURL">)[] = [];

		const result = await TwitchModule.authorization.request(Twitch.Helix.GetStreams.axiosRequest, {
			user_id: this.parent.id, type: "live", first: 1,
		});
		if (!result.ok) {
			Module.fatalWithDisabling(`Getting livestream information failed`, {error: `${result.status} - ${result.message}`});
			return changedEntries;
		}

		const data = result.data[0];
		if (!data) {
			if (this.isLive())
				this.setGettingVOD({endedAt: new Date().toISOString(), triesToGet: Module.TRIES_TO_GET});
		}

		this.status = "live";
		this.id = data.id;
		this.startedAt = data.started_at;
		if (this.title !== data.title) {
			this.title = data.title;
			changedEntries.push("title");
		}
		if (this.games == null) {
			this.games = [data.game_name];
			changedEntries.push("games");
		}
		else if (this.games[this.games.length - 1] !== data.game_name) {
			this.games.push(data.game_name);
			changedEntries.push("games");
		}
		if (this.viewers !== data.viewer_count) {
			this.viewers = data.viewer_count;
			changedEntries.push("viewers");
		}
		if (this.thumbnailURL !== data.thumbnail_url) {
			this.thumbnailURL = data.thumbnail_url;
			changedEntries.push("thumbnailURL");
		}
		return changedEntries;
	}

	async getVODFromRequest() {
		const result = await TwitchModule.authorization.request(Twitch.Helix.GetVideos.axiosRequest, {
			id: this.id, type: "archive", first: 1,
		});
		if (!result.ok)
			return Module.fatalWithDisabling(`Getting livestream information failed`, {error: `${result.status} - ${result.message}`});

		const data = result.data[0];
		if (!data)
			return null;

		this.endedAt = new Date(new Date(data.created_at).getTime() + Module.iso8601ToDecimalTime(data.duration)).toISOString();

		return data;
	}

	/** Do not forget `data.save()` after doing this */
	setOffline(): StreamOffline {
		this.status = "offline";
		delete this.id;
		delete this.startedAt;
		delete this.title;
		delete this.games;
		delete this.viewers;
		delete this.thumbnailURL;
		delete this.endedAt;
		delete this.triesToGet;
		return this as any;
	}

	/** Do not forget `data.save()` after doing this */
	setLive(fields: Required<Pick<Stream, "id" | "startedAt" | "title" | "games" | "viewers" | "thumbnailURL">>): StreamLive {
		this.status = "live";
		this.id = fields.id;
		this.startedAt = fields.startedAt;
		this.title = fields.title;
		this.games = fields.games;
		this.viewers = fields.viewers;
		this.thumbnailURL = fields.thumbnailURL;
		return this as any;
	}

	/**
	 * Do not forget `data.save()` after doing this
	 * 
	 * Use it only if `status` is `live`
	 */
	setGettingVOD(fields: Required<Pick<StreamSave, "endedAt" | "triesToGet">>): StreamGettingVOD {
		this.status = "getting_vod";
		delete this.thumbnailURL;
		this.endedAt = fields.endedAt;
		this.triesToGet = fields.triesToGet;
		return this as any;
	}

	isOffline(): this is StreamOffline {
		return this.status === "offline";
	}
	isLive(): this is StreamLive {
		return this.status === "live";
	}
	isGettingVOD(): this is StreamGettingVOD {
		return this.status === "getting_vod";
	}

	fromJSON(json: StreamSave) {
		this.status = json.status;
		this.id = json.id;
		this.startedAt = json.startedAt;
		this.title = json.title;
		this.games = json.games;
		this.viewers = json.viewers;
		this.endedAt = json.endedAt;
		this.triesToGet = json.triesToGet;
		return this;
	}

	toJSON(): StreamSave {
		return {
			status: this.status,
			id: this.id,
			startedAt: this.startedAt,
			title: this.title,
			games: this.games,
			viewers: this.viewers,
			endedAt: this.endedAt,
			triesToGet: this.triesToGet,
		};
	}
}

export interface StreamOffline extends Stream {
	status: "offline";
	id: undefined;
	startedAt: undefined;
	title: undefined;
	games: undefined;
	viewers: undefined;
	thumbnailURL: undefined;
	endedAt: undefined;
	triesToGet: undefined;
}

export interface StreamLive extends Stream {
	status: "live";
	id: string;
	startedAt: string;
	title: string;
	games: string[];
	viewers: number;
	thumbnailURL: string;
	endedAt: undefined;
	triesToGet: undefined;
}

export interface StreamGettingVOD extends Stream {
	status: "getting_vod";
	id: string;
	startedAt: string;
	title: string;
	games: string[];
	viewers: number;
	thumbnailURL: undefined;
	endedAt: string;
	triesToGet: number;
}