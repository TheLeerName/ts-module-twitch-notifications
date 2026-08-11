import Core from "../../../index.js";
import { SlashCommand } from "../../discord/slash-commands/index.js";

import Module from "../index.js";

import * as Discord from "discord.js";

/** That command name uses for slash command allowing/banning system, if this will be banned on server, module will stop functioning on this server */
export const slashCommandGetName = "tn-get";

export default () => {
	const c = new SlashCommand()
	.setName(slashCommandGetName)
	.setDescription(`Sends module parameters of this server from Twitch stream notifications module`)
	.setDescriptionLocalization("ru", `Отправляет параметры этого сервера у модуля оповещений о стримах на Twitch`)
	.setChatInput(async(interaction) => {
		if (!interaction.inCachedGuild()) return;

		const start = Date.now();
		await interaction.deferReply();

		const args: any = {
			guild: `${interaction.guild.name} (${interaction.guild.id})`,
			user: `${interaction.user.username} (${interaction.user.id})`
		};
		try {
			const guildData = await Module.data.getGuild(interaction.guild.id);

			const channelsCount = guildData.twitchChannelsByTwitchChannelID.size;
			await interaction.editReply({embeds: [new Discord.EmbedBuilder()
				.setTitle(`:notepad_spiral: Параметры сервера ${interaction.guild.name}`)
				.setFields(
					{
						name: "Категория для создания каналов",
						value: guildData.categoryID ? `<#${guildData.categoryID}>` : `*не установлено*`
					},
					{
						name: "Роль для пинга в сообщении",
						value: guildData.roleID ? `<@${guildData.roleID}>` : `*не установлено*`
					},
					{
						name: "Добавленных каналов",
						value: `${channelsCount}`
					}
				)
				.setColor("#77b255")
				.setFooter({text: `Время обработки: ${Core.humanizeDuration(Date.now() - start)}`})
			]});

			args.categoryID = guildData.categoryID;
			args.roleID = guildData.roleID;
			args.channelsCount = channelsCount;
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
	return c;
};