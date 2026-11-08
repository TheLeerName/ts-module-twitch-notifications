import Module from "./index.js";
import type { Channel } from "./channel.js";
import type { StreamGettingVOD, StreamLive } from "./stream.js";

export default class Polling {
	running = false;
	delay = 5000;

	runOrStop() {
		const count = Array.from(Module.channels.values()).filter(c => c.enabled && c.stream.isLive()).length;
		if (count > 0) this.run();
		else this.stop();
	}

	run() {
		if (this.running) return;
		this.running = true;
		setTimeout(() => this.poll(), this.delay);
	}

	stop() {
		if (!this.running) return;
		this.running = false;
	}

	protected async poll() {
		if (!this.running) return;

		// TODO: updateFromRequest for all channels in one axios request
		let save = false;
		for (const channel of Module.channels.values()) {
			if (!channel.enabled) continue;
			if (channel.stream.isLive()) {
				const changedEntries = await channel.stream.updateFromRequest();
				Module.emit("progress", channel as Channel<StreamLive>);
				if (changedEntries.length > 0) {
					Module.emit("progress_changed_entries", channel as Channel<StreamLive>, changedEntries);
					save = true;
				}
			}
			else if (channel.stream.isGettingVOD()) {
				const data = await channel.stream.getVODFromRequest();
				if (data != null) {
					Module.emit("vod_found", channel as Channel<StreamGettingVOD>, data.url);
					channel.stream.setOffline();
				}
				else
					channel.stream.triesToGet--;

				if (channel.stream.triesToGet < 1)
					Module.emit("vod_no_more_tries", channel as Channel<StreamGettingVOD>);
				save = true;
			}
		}
		if (save)
			Module.data.save();

		setTimeout(() => this.poll(), this.delay);
	}
}