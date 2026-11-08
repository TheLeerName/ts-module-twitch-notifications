import TwitchModule from "../twitch/index.js";
import Module from "./index.js";
import * as Data from "./data.js";
import { makeStreamOnlineMessage, makeStreamOfflineMessage } from "./messages.js";
import { skipGetStreamsPollingTimeout, prevGetStreams, pollingChannelsID } from "./twitch-polling.js";

import * as Twitch from "twitch.ts";

export default () => {
	TwitchModule.eventSub.on("session_welcome", (message, isReconnected) => onSessionWelcome(message, isReconnected));
	TwitchModule.eventSub.on("session_reconnect", message => onSessionReconnect(message));
	TwitchModule.eventSub.on("notification", message => onNotification(message));
	TwitchModule.eventSub.on("revocation", message => onRevocation(message));
};

export async function updateState() {
	if (Module.data.channels.size > 0)
		TwitchModule.eventSub.open();
	else
		TwitchModule.eventSub.close();
}


async function onSessionWelcome(message: Twitch.EventSub.Message.SessionWelcome, isReconnected: boolean) {
	if (isReconnected) {
		Module.log.info(`EventSub reconnected`, {args: {
			url: TwitchModule.eventSub.connection!.ws.url,
			session_id: message.payload.session.id,
			keepalive_timeout_seconds: message.payload.session.keepalive_timeout_seconds
		}});
	}
	else {
		Module.log.info(`EventSub connected`, {args: {
			url: TwitchModule.eventSub.connection!.ws.url,
			session_id: message.payload.session.id,
			keepalive_timeout_seconds: message.payload.session.keepalive_timeout_seconds
		}});

		for (const channelData of Module.data.channels.values()) {
			await deleteSubscriptions(channelData);
			await createSubscriptions(channelData);
		}
		Module.data.save();
	}
}

async function deleteSubscriptions(channelData: Data.TwitchChannel) {
	for (let i = 0; i < channelData.subscriptionsID.length; i++) {
		const id = channelData.subscriptionsID[i];
		const response = await Twitch.Request.DeleteEventSubSubscription(TwitchModule.authorization, id);
		if (response.ok) {
			channelData.subscriptionsID.push(id);
		}
		else {
			Module.log.verbose("EventSub subscription failed", {args: {
				twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
				id,
				status: response.status,
				message: response.message
			}});
		}
		channelData.subscriptionsID.splice(i, 1);
		i--;
	}
}

async function createSubscriptions(channelData: Data.TwitchChannel) {
	const online = Twitch.EventSub.Subscription.StreamOnline(TwitchModule.eventSub.connection!, channelData.user.id);

	const responseOnline = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.CreateEventSubSubscription, TwitchModule.authorization, online);
	if (!responseOnline.ok) {
		Module.log.error("EventSub subscription failed", {error: responseOnline, args: {
			twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
			type: `${online.type}@${online.version}`
		}});
		return;
	}
	channelData.subscriptionsID.push(responseOnline.data.id);

	const offline = Twitch.EventSub.Subscription.StreamOffline(TwitchModule.eventSub.connection!, channelData.user.id);
	const responseOffline = await TwitchModule.runRequestWithTokenRefreshing(Twitch.Request.CreateEventSubSubscription, TwitchModule.authorization, offline);
	if (!responseOffline.ok) {
		Module.log.error("EventSub subscription failed", {error: responseOffline, args: {
			twitchChannel: `${channelData.user.login} (${channelData.user.id})`,
			type: `${offline.type}@${offline.version}`
		}});
		return;
	}
	channelData.subscriptionsID.push(responseOffline.data.id);
}

async function onSessionReconnect(message: Twitch.EventSub.Message.SessionReconnect) {
	Module.log.info(`Twitch server requested session reconnect`, {args: {
		session_reconnect_url: message.payload.session.reconnect_url
	}});
}

async function onNotification(message: Twitch.EventSub.Message.Notification) {
	if (Twitch.EventSub.Message.Notification.isStreamOnline(message)) await onNotificationStreamOnline(message);
	else if (Twitch.EventSub.Message.Notification.isStreamOffline(message)) await onNotificationStreamOffline(message);
}

async function onNotificationStreamOnline(message: Twitch.EventSub.Message.Notification<Twitch.EventSub.Payload.StreamOnline>) {
	const event = message.payload.event;

	Module.log.verbose(`EventSub ${message.metadata.message_type} ${message.payload.subscription.type}@v${message.payload.subscription.version} message`, {args: {
		subscription_condition: message.payload.subscription.condition,
		subscription_cost: message.payload.subscription.cost,
		subscription_id: message.payload.subscription.id,
		message_id: message.metadata.message_id,
		event_broadcaster_user: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`,
		stream_id: event.id,
		stream_type: event.type
	}});

	const channelData = await Module.data.getTwitchChannel(event.broadcaster_user_id);
	if (!channelData) {
		Module.log.error(`Getting twitch channel failed, happening right after getting ${message.payload.subscription.type}@v${message.payload.subscription.version} event (i dont think this error is possible)`, {args: {
			twitchChannel: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`
		}});
		return;
	}
	await Module.updateUserData(channelData);

	if (!pollingChannelsID.includes(channelData.user.id))
		pollingChannelsID.push(channelData.user.id);

	await skipGetStreamsPollingTimeout();
	const entry = prevGetStreams?.[event.broadcaster_user_id]!;
	if (channelData.isStreamOffline())
		await makeStreamOnlineMessage(channelData, entry);
	else
		Module.log.error(`channelData.stream.status !== "offline" while posting offline message`, {args: {
			twitchChannel: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`
		}});
}

async function onNotificationStreamOffline(message: Twitch.EventSub.Message.Notification<Twitch.EventSub.Payload.StreamOffline>) {
	const event = message.payload.event;

	const log = Module.log.verbose(`EventSub ${message.metadata.message_type} ${message.payload.subscription.type}@v${message.payload.subscription.version} message`, {args: {
		subscription_condition: message.payload.subscription.condition,
		subscription_cost: message.payload.subscription.cost,
		subscription_id: message.payload.subscription.id,
		message_id: message.metadata.message_id,
		event_broadcaster_user: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`
	}});

	const channelData = await Module.data.getTwitchChannel(event.broadcaster_user_id);
	if (!channelData) {
		Module.log.error(`Getting twitch channel failed, happening right after getting ${message.metadata.message_type} ${message.payload.subscription.type}@v${message.payload.subscription.version} event (i dont think this error is possible)`, {args: {
			twitchChannel: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`
		}});
		return;
	}
	await Module.updateUserData(channelData);

	if (pollingChannelsID.includes(channelData.user.id))
		pollingChannelsID.splice(pollingChannelsID.indexOf(channelData.user.id), 1);

	if (channelData.isStreamLive())
		await makeStreamOfflineMessage(channelData);
	else
		Module.log.error(`channelData.stream.status !== "live" while posting offline message`, {args: {
			twitchChannel: `${event.broadcaster_user_login} (${event.broadcaster_user_id})`
		}});
}

async function onRevocation(message: Twitch.EventSub.Message.Revocation) {
	if (message.payload.subscription.type === "stream.online" || message.payload.subscription.type === "stream.offline") {
		const channelData = await Module.data.getTwitchChannel(message.payload.subscription.condition.broadcaster_user_id);
		if (!channelData) {
			Module.log.error(`Getting twitch channel failed, happening right after getting ${message.metadata.message_type} ${message.payload.subscription.type}@v${message.payload.subscription.version} event (i dont think this error is possible)`, {args: {
				twitchChannelID: message.payload.subscription.condition.broadcaster_user_id
			}});
			return;
		}

		Module.log.info(`EventSub subscription revoked`, {args: {
			subscription: message.payload.subscription.status,
			event: `${message.payload.subscription.type}@v${message.payload.subscription.version}`,
			channel: `${channelData.user.login} (${channelData.user.id})`
		}});

		if (message.payload.subscription.status === "user_removed") {
			channelData.banned = true;
			Module.data.save();
			if (channelData.isStreamLive())
				await makeStreamOfflineMessage(channelData, "Стрим окончен, потому что стример был забанен");
		}
		else if (message.payload.subscription.status === "authorization_revoked") {
			Module.log.fatal(`Authorization for twitch user ${channelData.user.id} was revoked`);
		}
		else if (message.payload.subscription.status === "version_removed") {
			Module.log.fatal(`Event ${message.payload.subscription.type} with version ${message.payload.subscription.version} was removed from Twitch`);
		}
	}
}