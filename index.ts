import Core from "../../index.js";
import TwitchModule from "../twitch/index.js";
import Data from "./data.js";
import { Channels } from "./channel.js";

import * as Twitch from "twitch.ts";

export class TwitchNotificationsModule {
	readonly name = "twitch-notifications" as const;
	readonly data: Data;
	readonly log = Core.log.makeFunctions(this.name);

	readonly channels = new Channels();

	constructor() {
		this.data = new Data(this).initialize();

		TwitchModule
			.once("initialized", () => this.onTwitchInitialized());
	}

	isDisabled() {
		return this.data.disabled;
	}

	async fatalWithDisabling(msg: any, options?: Parameters<typeof this.log.fatal>[1]) {
		this.data.disabled = true;
		await this.data.save();
		return this.log.fatal(msg, options);
	}

	protected async onTwitchInitialized() {
		this.channels.addFromJSON("1", {
			enabled: true,
			stream: { status: "offline" }
		});
		//this.data.save();
		console.log(JSON.stringify(this.channels.toJSON()));
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
		await this.data.save();
		/*TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOnline.RequestBody, {
			broadcaster_user_id: "",
		});
		TwitchModule.ws.subscribeToEvent(Twitch.EventSub.StreamOffline.RequestBody, {
			broadcaster_user_id: "",
		});*/
	}
}
export default new TwitchNotificationsModule();