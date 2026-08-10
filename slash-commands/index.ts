import { type Choices, choices_maxSize } from "../../twitch-in-discord-commands/slash-commands/index.js";
import { Guild } from "../data.js";

import { Collection } from "discord.js";

export const choices_guildTwitchChannel: Collection<string, Choices> = new Collection();
export function getChoices_guildTwitchChannel(guildData: Guild.Enabled, focused: string) {
	let choices = choices_guildTwitchChannel.get(guildData.guild.id);
	if (!choices) {
		choices = {
			array: [],
			lastModifiedTimestamp: guildData.twitchChannelsByTwitchChannelID.lastModifiedKeysTimestamp
		};
		choices_guildTwitchChannel.set(guildData.guild.id, choices);
		if (choices_guildTwitchChannel.size > choices_maxSize)
			choices_guildTwitchChannel.delete(choices_guildTwitchChannel.firstKey()!);
	}
	else if (choices.lastModifiedTimestamp === guildData.twitchChannelsByTwitchChannelID.lastModifiedKeysTimestamp) return choices.array;

	while (choices.array.length > 0) choices.array.pop();
	for (const [twitchChannelID, guildChannelData] of guildData.twitchChannelsByTwitchChannelID) {
		if (!guildChannelData.isEnabled()) continue;
		choices.array.push({name: guildChannelData.twitchChannel.user.display_name, value: twitchChannelID});
	}
	choices.array.sort((a, b) => a.name.indexOf(focused) - b.name.indexOf(focused));
	choices.array = choices.array.slice(0, 5);

	choices.lastModifiedTimestamp = guildData.twitchChannelsByTwitchChannelID.lastModifiedKeysTimestamp;
	return choices.array;
}