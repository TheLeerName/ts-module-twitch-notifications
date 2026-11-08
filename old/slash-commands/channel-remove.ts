import Core from "../../../index.js";
import { SlashCommand } from "../../discord/slash-commands/index.js";
import TwitchModule from "../../twitch/index.js";

import Module from "../index.js";
import { updateState } from "../twitch-eventsub.js";
import { getChoices_guildTwitchChannel } from "./index.js";

import * as Discord from "discord.js";
import { Request } from "twitch.ts";

type Mode = "remove_discord_channel" | "not_remove_discord_channel";
const mode_choices: Discord.RestOrArray<Discord.APIApplicationCommandOptionChoice<Mode>> = [
	{
		name: "Do not remove discord channel",
		name_localizations: { "ru": "Не удалять discord-канал" },
		value: "not_remove_discord_channel"
	},
	{
		name: "Remove discord channel",
		name_localizations: { "ru": "Удалить discord-канал" },
		value: "remove_discord_channel"
	}
];

export default () => {
	const c = new SlashCommand()
	.setName("tn-channel-remove")
	.setDescription(`Removes channel with stream notifications of specified Twitch channel`)
	.setDescriptionLocalization("ru", `Удаляет канал с уведомлениями о стриме для выбранного Twitch-канала`)
	.setAutocomplete(async(interaction) => {
		if (!interaction.inCachedGuild()) return;

		const guildData = await Module.data.getGuild(interaction.guild.id);
		const focused = interaction.options.getFocused();
		const choices = getChoices_guildTwitchChannel(guildData, focused);
		await interaction.respond(choices);
	}).setChatInput(async(interaction) => {
		if (!interaction.inCachedGuild()) return;

		const start = Date.now();
		await interaction.deferReply();

		const args: any = {
			guild: `${interaction.guild.name} (${interaction.guild.id})`,
			user: `${interaction.user.username} (${interaction.user.id})`
		};
		try {
			const query = interaction.options.getString("query", true);
			args.query = query;
			const removeMode = interaction.options.getString("remove-mode", true) as Mode;
			args.removeMode = removeMode;

			if (query.length < 1)
				throw new Error("Параметр query не указан");

			const guildData = await Module.data.getGuild(interaction.guild.id);
			const channelData = Module.data.channels.get(query);
			if (!channelData)
				throw new Error("Указанный Twitch-канал не был добавлен в бота!");

			let guildChannelData = Module.data.getGuildTwitchChannel(guildData, channelData);
			if (!guildChannelData.isEnabled())
				throw new Error("Указанный Twitch-канал не был добавлен в бота!");

			if (removeMode === "remove_discord_channel") {
				try {
					await Core.tasks.queue(`channel_${guildChannelData.channel.id}_delete`, signal => new Promise(async(resolve, reject) => {
						signal.onabort = reject;
						guildChannelData.channel!.delete(`Удаление из модуля "twitch-notifications"`).then(resolve).catch(reject);
					}));
				}
				catch(error) {
					Module.log.error("Deleting discord channel failed", {error, args: {
						guild: `${interaction.guild.name} (${interaction.guild.id})`,
						user: `${interaction.user.username} (${interaction.user.id})`,
						query, removeMode,
						twitchStreamerLogin: channelData.user.login,
						twitchGuildChannelData: guildChannelData,
						discordChannel: `#${guildChannelData.channel.name} (${guildChannelData.channel.id})`
					}});
				}
			}

			guildChannelData = guildChannelData.disable();

			let removeChannelData = true;
			for (const guildData of Module.data.guilds.values()) {
				if (!guildData.isEnabled()) continue;
				const guildChannelData = Module.data.getGuildTwitchChannel(guildData, channelData);

				if (guildChannelData.isEnabled()) {
					removeChannelData = false;
					break;
				}
			}

			if (removeChannelData) {
				guildData.twitchChannelsByTwitchChannelID.delete(channelData.user.id);
				Module.data.channels.delete(channelData.user.id);
				for (const guildChannelData of channelData.guildTwitchChannels.values())
					guildChannelData.guild?.twitchChannelsByTwitchChannelID.delete(channelData.user.id);
				for (const id of channelData.subscriptionsID) {
					const response = await Request.DeleteEventSubSubscription(TwitchModule.authorization, id);
					if (!response.ok)
						Module.log.error(`Removing EventSub subscription failed`, {error: response, args: {id}});
					channelData.subscriptionsID.splice(channelData.subscriptionsID.indexOf(id), 1);
				}
			}
			updateState();
			Module.data.save();

			await interaction.editReply({embeds: [new Discord.EmbedBuilder()
				.setTitle(`:white_check_mark: Twitch-канал ${channelData.user.display_name} был успешно удалён из оповещений!`)
				.setColor("#77b255")
				.setFooter({text: `Время обработки: ${Core.humanizeDuration(Date.now() - start)}`})
			]});

			args.twitchGuildChannelData = guildChannelData;
			args.twitchStreamerData = channelData.user;
			args.twitchStreamData = channelData.stream;
			Module.log.info(`Command ${c.name} success`, {args});
		}
		catch(error) {
			await interaction.editReply({embeds: [new Discord.EmbedBuilder()
				.setTitle(`:x: Ошибка!`)
				.setDescription(`\`\`\`\n${error.message}\n\`\`\``)
				.setColor("#dd2e44")
				.setFooter({text: `Время обработки: ${Core.humanizeDuration(Date.now() - start)}`})
			]});

			Module.log.error(`Command ${c.name} failed`, {error, args});
		}
	});
	c.addStringOption(option => option
		.setName("query")
		.setDescription("Twitch channel ID")
		.setDescriptionLocalization("ru", "ID Twitch-канала")
		.setRequired(true)
		.setAutocomplete(true)
	).addStringOption(option => option
		.setName("remove-mode")
		.setDescription("Removing mode")
		.setDescriptionLocalization("ru", "Режим удаления")
		.setChoices(mode_choices)
		.setRequired(true)
	);
	return c;
};