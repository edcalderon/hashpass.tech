import React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import EventRoomChat from "../../../components/EventRoomChat";
import { getCurrentEvent } from "../../../lib/event-detector";
import { isEventChatPastEvent } from "../../../lib/event-chat";
import { useTranslation } from "../../../i18n/i18n";

export default function EventChatScreen() {
  const { t: translate } = useTranslation();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";
  const event = eventId ? getCurrentEvent(eventId) : null;

  if (!event) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text>{translate("eventChat.chooseEvent", "Choose an event to open its room.")}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <EventRoomChat
        eventId={event.id}
        eventTitle={event.title}
        isPastEvent={isEventChatPastEvent(event)}
      />
    </>
  );
}
