import Core from "../../../index.js";
import { SlashCommand } from "../../discord/slash-commands/index.js";

import Module from "../index.js";
import { getChoices_guildTwitchChannel } from "./index.js";

import { EmbedBuilder } from "discord.js";

export default () => {
	const c = new SlashCommand()
	.setName("tn-channel-get")
	.setDescription(`Sends parameters of specific channel from Twitch stream notifications module`)
	.setDescriptionLocalization("ru", `Отправляет параметры указанного канала у модуля оповещений о стриме на Twitch`)
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
			if (query.length < 1)
				throw new Error("Параметр query не указан");
			args.query = query;

			const guildData = await Module.data.getGuild(interaction.guild.id);
			const channelData = Module.data.channels.get(query);
			if (!channelData)
				throw new Error("Указанный Twitch-канал не был добавлен в бота!");

			const guildChannelData = Module.data.getGuildTwitchChannel(guildData, channelData);
			if (!guildChannelData.isEnabled())
				throw new Error("Указанный Twitch-канал не был добавлен в бота!");

			const fields = [
				{
					name: "Статус",
					value: channelData.banned ? "Забанен" : "Доступен"
				},
				{
					name: "ID",
					value: `\`${channelData.user.id}\``
				},
				{
					name: "Дата регистрации",
					value: `<t:${Math.floor(new Date(channelData.user.created_at).getTime() / 1000)}:F>`
				},
				{
					name: "Тип канала",
					value: `\`${channelData.user.broadcaster_type === "partner" ? "Партнёр" : (channelData.user.broadcaster_type === "affiliate" ? "Компаньон" : "Обычный")}\``
				},
				{
					name: "Тип пользователя (админ/модер твича)",
					value: `\`${channelData.user.type === "admin" ? "Администратор" : (channelData.user.type === "global_mod" ? "Модератор" : (channelData.user.type === "staff" ? "Staff" : "Обычный"))}\``
				},
				{
					name: "Канал для уведомлений",
					value: `<#${guildChannelData.channel.id}>`
				},
				{
					name: "Используемое сообщение",
					value: guildChannelData.message ? `https://discord.com/channels/${interaction.guild.id}/${guildChannelData.channel.id}/${guildChannelData.message.id}` : `*нет*`
				}
			];
			if (channelData.stream.status !== "offline")
				fields.push({
					name: "Сохранённые данные стрима",
					value: `\`\`\`json\n${JSON.stringify(channelData.stream, null, "\t")}\n\`\`\``
				});

			const msg = {embeds: [new EmbedBuilder()
				.setTitle(`:notepad_spiral: Параметры канала ${channelData.user.display_name}`)
				.setThumbnail(channelData.user.profile_image_url)
				.setFields(...fields)
				.setColor("#77b255")
				.setFooter({text: `Время обработки: ${Core.humanizeDuration(Date.now() - start)}`})
			]};
			if (channelData.user.description.length > 0) msg.embeds[0].setDescription(channelData.user.description);
			if (channelData.user.offline_image_url.length > 0) msg.embeds[0].setImage(channelData.user.offline_image_url);
			await interaction.editReply(msg);

			args.twitchGuildChannelData = guildChannelData;
			args.twitchStreamerData = channelData.user;
			args.twitchStreamData = channelData.stream;
			Module.log.info(`Command ${interaction.commandName} ${c.name} success`, {args});
		}
		catch(error) {
			await interaction.editReply({embeds: [new EmbedBuilder()
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
	);
	return c;
};