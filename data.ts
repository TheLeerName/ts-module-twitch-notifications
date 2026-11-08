import { TwitchNotificationsModule as Module } from "./index.js";
import { BaseData } from "../../data.js";

export default class Data extends BaseData {
	/** Module will disable itself on next app start, when fatal error will occure */
	disabled: boolean = false;

	protected module: Module;

	initialize() {
		const json = super.getSavedFields();
		let needsSave = true;

		needsSave = !this.registerFieldMap(json, "channels",
			savedValue => this.module.channels.fromJSON(savedValue),
			() => this.module.channels.toJSON(),
		);
		needsSave = !this.registerFieldBoolean(json, "disabled");

		if (needsSave)
			this.save();
		return this;
	}
}