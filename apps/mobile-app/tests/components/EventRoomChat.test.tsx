/// <reference types="jest" />

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockLoadEventChat = jest.fn();
const mockLoadEventChatMembers = jest.fn();
const mockHeartbeat = jest.fn();
const mockSendEventChatMessage = jest.fn();
const mockAlert = jest.fn();
const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Linking: {
    canOpenURL: (...args: unknown[]) => mockCanOpenURL(...args),
    openURL: (...args: unknown[]) => mockOpenURL(...args),
  },
  Modal: "Modal",
  Platform: { OS: "android" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  View: "View",
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
jest.mock("react-native-css-interop/jsx-runtime", () =>
  require("react/jsx-runtime"),
);

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace }),
}));
jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#b91c1c",
      divider: "#e5e7eb",
      background: { default: "#fff", paper: "#fff" },
      text: { primary: "#111827", secondary: "#4b5563" },
    },
  }),
}));
jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    isLoggedIn: true,
    dbUserId: "viewer-1",
    user: {
      email: "ed@example.com",
      user_metadata: { full_name: "Edward Calderon" },
    },
  }),
}));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallbackOrParams: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback =
        typeof fallbackOrParams === "string" ? fallbackOrParams : _key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      return fallback.replace(/\{(\w+)\}/g, (_, name) =>
        String(params?.[name] ?? `{${name}}`),
      );
    },
  }),
}));
jest.mock("../../lib/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));
jest.mock("../../lib/event-chat", () => ({
  isEventChatAccessDenied: (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      (error as { status?: number }).status === 403,
    ),
  getEventChatAccessCopy: (isPastEvent: boolean) =>
    isPastEvent
      ? {
          title: "This room is for event attendees",
          body: "Only verified attendees can access this room.",
          actionLabel: null,
        }
      : {
          title: "You can't enter this event room",
          body: "You need an active pass for this event.",
          actionLabel: "Buy a ticket",
        },
  getEventChatAvatarUrl: ({ senderId }: { senderId?: string | null }) =>
    `avatar:${senderId || "anonymous"}`,
  getEventChatUpgradeUrl: (eventId: string, tier: string) =>
    `https://tickets.test/${eventId}?tier=${tier}`,
  heartbeatEventChatPresence: (...args: unknown[]) => mockHeartbeat(...args),
  loadEventChat: (...args: unknown[]) => mockLoadEventChat(...args),
  loadEventChatMembers: (...args: unknown[]) =>
    mockLoadEventChatMembers(...args),
  sendEventChatMessage: (...args: unknown[]) =>
    mockSendEventChatMessage(...args),
}));

import EventRoomChat from "../../components/EventRoomChat";

const baseData = {
  eventId: "colombia2026",
  viewerId: "viewer-1",
  passType: "business" as const,
  permissions: { canReadRoom: true, canSendRoom: true, canSendDirect: false },
  presence: { peopleCount: 0, avatarUrls: [] },
  roomRateLimit: { limit: 5, consecutiveMessages: 0, waitingForReply: false },
  messages: [],
};

const textContent = (renderer: TestRenderer.ReactTestRenderer): string =>
  renderer.root
    .findAllByType("Text" as any)
    .map((node: any) => String(node.props.children ?? ""))
    .join(" ");

async function pressLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
) {
  const target = renderer.root.findAll(
    (node: any) => node.props.accessibilityLabel === label,
  )[0];
  await act(async () => {
    await target.props.onPress();
  });
}

async function pressText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
) {
  const target = renderer.root
    .findAllByType("Text" as any)
    .find((node: any) => String(node.props.children ?? "") === label);
  const parent = target?.parent;
  if (!parent?.props?.onPress)
    throw new Error(`No pressable text found: ${label}`);
  await act(async () => {
    await parent.props.onPress();
  });
}

async function enterRoom(renderer: TestRenderer.ReactTestRenderer) {
  await pressLabel(renderer, "Enter event room");
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderRoom(props: React.ComponentProps<typeof EventRoomChat>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<EventRoomChat {...props} />);
    await Promise.resolve();
  });
  return renderer;
}

async function unmountRoom(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () => renderer.unmount());
}

describe("EventRoomChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);
    mockHeartbeat.mockResolvedValue({ peopleCount: 0, avatarUrls: [] });
    mockSendEventChatMessage.mockResolvedValue({ id: "sent-1" });
    mockLoadEventChatMembers.mockResolvedValue([]);
    mockLoadEventChat.mockResolvedValue({ ...baseData });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("shows the entry rules, supports anonymous identity, and renders zero live attendees", async () => {
    mockLoadEventChat.mockResolvedValue({
      ...baseData,
      passType: "general",
      permissions: {
        canReadRoom: true,
        canSendRoom: false,
        canSendDirect: false,
      },
    });
    const renderer = await renderRoom({
      eventId: "colombia2026",
      eventTitle: "Blockchain Summit Latam Colombia 2026",
    });

    expect(textContent(renderer)).toContain("No spam, harassment, scams");
    const radios = renderer.root.findAll(
      (node: any) => node.props.accessibilityRole === "radio",
    );
    await act(async () => radios[1].props.onPress());
    await enterRoom(renderer);

    expect(textContent(renderer)).toContain("0 people in room");
    expect(textContent(renderer)).toContain(
      "General pass: you can read this room",
    );
    expect(mockLoadEventChat).toHaveBeenCalledWith(
      "colombia2026",
      "room",
      undefined,
    );
    await unmountRoom(renderer);
  });

  it("closes the entry drawer from Not now and the explicit close button", async () => {
    const renderer = await renderRoom({
      eventId: "colombia2026",
      eventTitle: "Colombia 2026",
    });
    const modal = renderer.root.findByType("Modal" as any);

    await pressText(renderer, "Not now");
    expect(modal.props.visible).toBe(false);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <EventRoomChat eventId="colombia2026" eventTitle="Colombia 2026" />,
      );
      await Promise.resolve();
    });
    const closeButton = renderer.root.find(
      (node: any) => node.props.accessibilityLabel === "Close event room entry",
    );
    await act(async () => closeButton.props.onPress());
    expect(renderer.root.findByType("Modal" as any).props.visible).toBe(false);
    expect(mockRouterBack).toHaveBeenCalledTimes(2);

    await unmountRoom(renderer);
  });

  it("closes the entry drawer when the backdrop is pressed", async () => {
    const renderer = await renderRoom({
      eventId: "colombia2026",
      eventTitle: "Colombia 2026",
    });
    const backdrop = renderer.root.findByProps({
      testID: "event-room-entry-backdrop",
    });

    await act(async () => backdrop.props.onPress());

    expect(renderer.root.findByType("Modal" as any).props.visible).toBe(false);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    await unmountRoom(renderer);
  });

  it("sends replies and emojis, while opening attendee profiles for direct-message upgrades", async () => {
    mockLoadEventChat.mockResolvedValue({
      ...baseData,
      messages: [
        {
          id: "message-1",
          event_id: "colombia2026",
          sender_id: "attendee-1",
          sender_name: "Attendee One",
          message: "Welcome to the room",
          message_type: "text",
          created_at: "2026-08-13T12:00:00.000Z",
        },
      ],
    });
    const renderer = await renderRoom({
      eventId: "colombia2026",
      eventTitle: "Colombia 2026",
    });
    await enterRoom(renderer);

    expect(textContent(renderer)).toContain("Welcome to the room");
    await pressLabel(renderer, "Open Attendee One profile");
    expect(mockAlert).toHaveBeenCalledWith(
      "Attendee One",
      expect.stringContaining("Upgrade to a VIP pass"),
    );

    await pressLabel(renderer, "Reply to message");
    const input = renderer.root.find(
      (node: any) => node.props.accessibilityLabel === "Message",
    );
    await act(async () => input.props.onChangeText("Thanks"));
    await pressLabel(renderer, "Send message");
    expect(mockSendEventChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Thanks",
        replyToMessageId: "message-1",
      }),
    );

    await pressLabel(renderer, "Choose emoji");
    expect(textContent(renderer)).toContain("Reactions");
    await pressLabel(renderer, "Send 👍");
    expect(mockSendEventChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: "👍", messageType: "emoji" }),
    );
    await unmountRoom(renderer);
  });

  it("loads VIP members and sends a direct message to the selected attendee", async () => {
    mockLoadEventChat.mockResolvedValue({
      ...baseData,
      passType: "vip",
      permissions: {
        canReadRoom: true,
        canSendRoom: true,
        canSendDirect: true,
      },
    });
    mockLoadEventChatMembers.mockResolvedValue([
      {
        userId: "attendee-2",
        name: "Business Attendee",
        passType: "business",
        avatarUrl: null,
      },
    ]);
    const renderer = await renderRoom({
      eventId: "colombia2026",
      eventTitle: "Colombia 2026",
    });
    await enterRoom(renderer);
    await pressText(renderer, "Direct messages");
    await act(async () => {
      await Promise.resolve();
    });
    await pressLabel(renderer, "Message Business Attendee");
    const input = renderer.root.find(
      (node: any) => node.props.accessibilityLabel === "Message",
    );
    await act(async () => input.props.onChangeText("Private hello"));
    await pressLabel(renderer, "Send message");
    expect(mockSendEventChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "colombia2026",
        message: "Private hello",
        recipientId: "attendee-2",
      }),
    );
    await unmountRoom(renderer);
  });

  it("replaces the protected route with Explore when the attendee check is denied", async () => {
    const denied = Object.assign(new Error("No active event pass"), {
      status: 403,
    });
    mockLoadEventChat.mockRejectedValue(denied);
    const renderer = await renderRoom({
      eventId: "bsl2025",
      eventTitle: "Blockchain Summit Latam 2025",
      isPastEvent: true,
    });
    await enterRoom(renderer);

    expect(textContent(renderer)).toContain("This room is for event attendees");
    expect(textContent(renderer)).toContain("Go back to Explore events");
    await pressText(renderer, "Go back to Explore events");
    expect(mockRouterReplace).toHaveBeenCalledWith("/dashboard/explore");
    await unmountRoom(renderer);
  });
});
