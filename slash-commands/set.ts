import Core from "../../../index.js";
import { SlashCommand } from "../../discord/slash-commands/index.js";

import Module from "../index.js";

import * as Discord from "discord.js";

export default () => {
	const c = new SlashCommand()
	.setName("tn-set")
	.setDescription(`Changes module parameters of this server in Twitch stream notifications module`)
	.setDescriptionLocalization("ru", `Изменяет параметры этого сервера в модуле оповещений о стримах на Twitch`)
	.setChatInput(async(interaction) => {
		if (!interaction.inCachedGuild()) return;

		const start = Date.now();
		await interaction.deferReply();

		const args: any = {
			guild: `${interaction.guild.name} (${interaction.guild.id})`,
			user: `${interaction.user.username} (${interaction.user.id})`
		};
		try {
			const channel = interaction.options.getChannel<Discord.ChannelType.GuildCategory>("category");
			const role = interaction.options.getRole("role");

			const guildData = await Module.data.getGuild(interaction.guild.id);
			guildData.categoryID = channel?.id;
			guildData.roleID = role?.id;

			args.categoryID = guildData.categoryID;
			args.roleID = guildData.roleID;
			await interaction.editReply({embeds: [new Discord.EmbedBuilder()
				.setTitle(`:white_check_mark: Успешно!`)
				.setColor("#77b255")
				.setFooter({text: `Время обработки: ${Core.humanizeDuration(Date.now() - start)}`})
			]});
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
		finally {
			Module.data.save();
		}
	});
	c.addChannelOption(option => option
		.setName("category")
		.setDescription("New channels will be created in this category")
		.setDescriptionLocalization("ru", "Новые каналы будут создаваться в этой категории")
		.addChannelTypes(Discord.ChannelType.GuildCategory)
	).addRoleOption(option => option
		.setName("role")
		.setDescription("Role which will be pinged on stream notification")
		.setDescriptionLocalization("ru", "Роль которая будет пинговаться при уведомлении о стриме")
	);
	return c;
};