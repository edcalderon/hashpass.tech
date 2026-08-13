/// <reference types="jest" />

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockParams = jest.fn();
const mockGetCurrentEvent = jest.fn();

jest.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock(
  "react-native-css-interop/src/runtime/native/appearance-observables",
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);
jest.mock("react-native-css-interop/jsx-runtime", () => require("react/jsx-runtime"));
jest.mock("expo-router", () => ({
  Stack: { Screen: "Stack.Screen" },
  useLocalSearchParams: () => mockParams(),
}));
jest.mock("../../lib/event-detector", () => ({
  getCurrentEvent: (...args: unknown[]) => mockGetCurrentEvent(...args),
}));
jest.mock("../../lib/event-chat", () => ({
  isEventChatPastEvent: (event: { past?: boolean }) => Boolean(event.past),
}));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock("../../components/EventRoomChat", () => "EventRoomChat");

import EventChatScreen from "../../app/(shared)/dashboard/event-chat";

async function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<EventChatScreen />);
    await Promise.resolve();
  });
  return renderer;
}

describe("EventChatScreen route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ eventId: "colombia2026" });
    mockGetCurrentEvent.mockReturnValue({
      id: "colombia2026",
      title: "Blockchain Summit Latam Colombia 2026",
      past: false,
    });
  });

  it("passes the selected event and past status to the protected room", async () => {
    const renderer = await renderScreen();
    const room = renderer.root.findByType("EventRoomChat" as any);
    expect(room.props).toEqual({
      eventId: "colombia2026",
      eventTitle: "Blockchain Summit Latam Colombia 2026",
      isPastEvent: false,
    });
    await act(async () => renderer.unmount());
  });

  it("shows a translated event selector prompt when the route has no valid event", async () => {
    mockParams.mockReturnValue({});
    mockGetCurrentEvent.mockReturnValue(null);
    const renderer = await renderScreen();
    expect(renderer.root.findByType("Text" as any).props.children).toBe(
      "Choose an event to open its room.",
    );
    await act(async () => renderer.unmount());
  });
});
