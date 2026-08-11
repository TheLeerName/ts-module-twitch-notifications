import Core from "../../../index.js";
import TwitchModule from "../../twitch/index.js";
import { SlashCommand } from "../../discord/index.js";
import { getChoices_twitchChannel } from "../../twitch-in-discord-commands/slash-commands/index.js";

import * as Data from "../data.js";
import { makeStreamOnlineMessage } from "../messages.js";
import { updateState } from "../twitch-eventsub.js";
import Module from "../index.js";
import { slashCommandSetName } from "./set.js";

import * as Discord from "discord.js";
import * as Twitch from "twitch.ts";

export default () => {
	const c = new SlashCommand()
	.setName("tn-channel-add")
	.setDescription(`Creates channel with stream notifications of specified Twitch channel`)
	.setDescriptionLocalization("ru", `Создаёт канал с уведомлениями о стриме для выбранного Twitch-канала`)
	.setAutocomplete(async(interaction) => {
		if (!interaction.inCachedGuild()) return;

		const focused = interaction.options.getFocused();
		const choices = await getChoices_twitchChannel(focused);
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
			let channel = interaction.options.getChannel<Discord.ChannelType.GuildAnnouncement>("channel");

			if (query.length < 1)
				throw new Error("Параметр query не указан");

			const guildData = await Module.data.getGuild(interaction.guild.id);
			if (!guildData.categoryID)
				throw new Error(`Категория для создания каналов не была указана, используйте команду /${slashCommandSetName} чтобы установить её`);

			let channelData = await Module.data.getTwitchChannel(query);
			if (!channelData)
				throw new Error("Указанный Twitch-канал не найден или был забанен");

			let guildChannelData: Data.GuildTwitchChannel | Error = Module.data.getGuildTwitchChannel(guildData, channelData);
			if (guildChannelData.enabled)
				throw new Error("Указанный Twitch-канал уже был добавлен");

			if (channel)
				guildChannelData = guildChannelData.enable(guildData, channelData, channel, guildChannelData.message ?? undefined);
			else {
				guildChannelData = await Module.data.getEnabledGuildTwitchChannel(guildData, channelData);
				if (guildChannelData instanceof Error)
					throw guildChannelData;
			}

			if (channelData.isStreamOffline()) {
				const responseGetStreams = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.GetStreams, TwitchModule.authorization, channelData.user.id, undefined, undefined, "live");
				if (!responseGetStreams.ok)
					throw new Error(`Ошибка ${responseGetStreams.status}: ${responseGetStreams.message}`);
				if (responseGetStreams.data.length > 0) {
					const stream = responseGetStreams.data[0];
					makeStreamOnlineMessage(channelData, stream);
				}
				updateState();
			}

			const msg = {embeds: [new Discord.EmbedBuilder()
				.setTitle(`:white_check_mark: Twitch-канал ${channelData.user.display_name} был успешно добавлен в оповещения!`)
				.setThumbnail(channelData.user.profile_image_url)
				.setFields(
					{
						name: "ID",
						value: `\`${channelData.user.id}\``
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
						name: "Дата регистрации",
						value: `<t:${Math.floor(new Date(channelData.user.created_at).getTime() / 1000)}:F>`,
						inline: true
					}
				)
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
	c.addStringOption(option => option
		.setName("query")
		.setDescription("Twitch channel ID")
		.setDescriptionLocalization("ru", "ID Twitch-канала")
		.setRequired(true)
		.setAutocomplete(true)
	).addChannelOption(option => option
		.setName("channel")
		.setDescription("Channel for stream notifications of this twitch channel, if not specified a new one will be created")
		.setDescriptionLocalization("ru", "Discord-канал для уведомлений о стриме об этом канале, если не указан то будет создан новый")
		.addChannelTypes(Discord.ChannelType.GuildAnnouncement)
	);
	return c;
};