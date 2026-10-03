/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

let mockEvent: Record<string, unknown> | null = null;
const mockRouterPush = jest.fn();

jest.mock("@contexts/EventContext", () => ({
  useEvent: () => ({ event: mockEvent }),
}));

// Same reasoning as event-info.test.tsx: avoid pulling in the real
// expo-router/@react-navigation machinery for a single router.push call.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@expo/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));

jest.mock("../../../components/EventBanner", () => "EventBanner");

// Surface/ActionButton/ModalBackdrop/HoverText carry their own
// animation/gesture machinery that isn't meaningful here -- render them as
// plain host components (same pattern as BusinessInviteRequestModal.test.tsx)
// so onPress/props can be driven and asserted on directly.
jest.mock("@hashpass/ui/primitives", () => ({
  Surface: "Surface",
  ActionButton: "ActionButton",
  ModalBackdrop: "ModalBackdrop",
  HoverText: "HoverText",
}));

jest.mock("react-native-webview", () => ({ WebView: "WebView" }));

import React from "react";
import { Linking, Platform } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import TicketsScreen from "../../../app/events/[eventSlug]/tickets";

const COLOMBIA_EVENT = {
  id: "colombia2026",
  title: "Blockchain Summit Latam Colombia 2026",
  eventDateString: "November 5-6, 2026",
  tour: { venue: "Corferias", city: "Bogotá", country: "Colombia" },
};

function renderScreen(): ReactTestRenderer {
  let view!: ReactTestRenderer;
  act(() => {
    view = create(<TicketsScreen />);
  });
  return view;
}

function findButton(view: ReactTestRenderer, label: string) {
  return view.root
    .findAllByType("ActionButton" as any)
    .find((node) => node.props.label === label)!;
}

function findTicketHostnameLink(view: ReactTestRenderer) {
  return view.root
    .findAllByProps({ accessibilityRole: "link" })
    .find(
      (node) =>
        typeof node.props.onPress === "function" &&
        typeof node.props.accessibilityLabel === "string" &&
        node.props.accessibilityLabel.startsWith("Tickets provided by"),
    )!;
}

// view.toJSON() embeds raw, not-yet-rendered React elements passed as props
// (e.g. ActionButton's trailingIcon={<MaterialIcons .../>}), which in dev
// mode carry a Fiber `_owner` back-reference -- JSON.stringify(view.toJSON())
// throws "Converting circular structure to JSON" as soon as one of those is
// reached. Collecting only rendered text children avoids walking into props
// entirely.
function collectText(node: unknown): string {
  if (node == null || typeof node === "boolean" || typeof node === "number") return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object" && "children" in (node as Record<string, unknown>)) {
    return collectText((node as { children: unknown }).children);
  }
  return "";
}

describe("TicketsScreen", () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    mockEvent = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalPlatformOs;
  });

  it('renders the default colombia2026 event with a "Date TBA" fallback and no venue/city rows', () => {
    const view = renderScreen();
    const text = collectText(view.toJSON());

    expect(text).toContain("Event Tickets");
    expect(text).toContain("Date TBA");
    expect(text).toContain("Tickets provided by bsl.blckchn.xyz");
    expect(text).not.toContain("Corferias");
  });

  it("shows venue and city/country rows when the event has tour details", () => {
    mockEvent = COLOMBIA_EVENT;
    const view = renderScreen();
    const text = collectText(view.toJSON());

    expect(text).toContain(COLOMBIA_EVENT.eventDateString);
    expect(text).toContain("Corferias");
    expect(text).toContain("Bogotá, Colombia");
  });

  it('opens the ticket purchase modal from "Purchase Tickets" and closes it again via the close button and onRequestClose', () => {
    const view = renderScreen();
    act(() => findButton(view, "Purchase Tickets").props.onPress());
    expect(view.root.findByType("Modal" as any).props.visible).toBe(true);

    const closeButton = view.root
      .findAllByProps({ accessibilityLabel: "Close ticket modal" })
      .find((node) => typeof node.props.onPress === "function")!;
    act(() => closeButton.props.onPress());
    expect(view.root.findAllByType("Modal" as any)).toHaveLength(0);

    // onRequestClose (hardware back / swipe-down dismiss) drives the same setter.
    act(() => findButton(view, "Purchase Tickets").props.onPress());
    act(() => view.root.findByType("Modal" as any).props.onRequestClose());
    expect(view.root.findAllByType("Modal" as any)).toHaveLength(0);
  });

  it('navigates to Contact Support from the "Need Help?" card', () => {
    const view = renderScreen();
    act(() => findButton(view, "Contact Support").props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith("/(shared)/support");
  });

  it("opens the external ticket link in a new browser tab on web", () => {
    Platform.OS = "web";
    const openMock = jest.fn();
    const originalWindow = (global as any).window;
    Object.defineProperty(global, "window", {
      configurable: true,
      value: { open: openMock },
    });

    const view = renderScreen();
    act(() => findTicketHostnameLink(view).props.onPress());

    expect(openMock).toHaveBeenCalledWith(
      "https://bsl.blckchn.xyz/e/bsl-colombia-2026#tickets",
      "_blank",
      "noopener,noreferrer",
    );

    Object.defineProperty(global, "window", { configurable: true, value: originalWindow });
  });

  it("falls back to Linking.openURL on native platforms and swallows a rejected navigation", () => {
    Platform.OS = "ios";
    const openURLSpy = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));

    const view = renderScreen();
    act(() => findTicketHostnameLink(view).props.onPress());

    expect(openURLSpy).toHaveBeenCalledWith(
      "https://bsl.blckchn.xyz/e/bsl-colombia-2026#tickets",
    );
  });

  it("uses Hash Poker's current PKRR registration URL for the external handoff", () => {
    Platform.OS = "web";
    const openMock = jest.fn();
    const originalWindow = (global as any).window;
    Object.defineProperty(global, "window", {
      configurable: true,
      value: { open: openMock },
    });
    mockEvent = {
      id: "hash-poker",
      website: "https://hash.poker",
      cta: { label: "Reserve seat", url: "https://pkrr.io/reg/current-tournament" },
    };
    const view = renderScreen();
    const text = collectText(view.toJSON());

    expect(text).toContain("Tickets provided by pkrr.io");
    expect(text).not.toContain("Tickets provided by hash.poker");

    act(() => findTicketHostnameLink(view).props.onPress());
    expect(openMock).toHaveBeenCalledWith(
      "https://pkrr.io/reg/current-tournament",
      "_blank",
      "noopener,noreferrer",
    );

    Object.defineProperty(global, "window", { configurable: true, value: originalWindow });
  });

  it("falls back to the PKRR club page when there is no current Hash Poker registration", () => {
    mockEvent = { id: "hash-poker", website: "https://hash.poker" };
    const view = renderScreen();

    expect(collectText(view.toJSON())).toContain("Tickets provided by pkrr.io");
  });

  it("builds the ticket URL from event.website for other non-colombia2026 events", () => {
    mockEvent = { id: "another-event", website: "https://tickets.example.com/" };
    const view = renderScreen();

    expect(collectText(view.toJSON())).toContain("Tickets provided by tickets.example.com");
  });

  it("falls back to the bsl.blckchn.xyz ticket URL by event id when there is no website", () => {
    mockEvent = { id: "another-event" };
    const view = renderScreen();
    const text = collectText(view.toJSON());

    expect(text).toContain("Tickets provided by bsl.blckchn.xyz");
  });

  it("directs Hash Poker ticket questions to the PKRR tournament team", () => {
    mockEvent = { id: "hash-poker" };
    const view = renderScreen();

    expect(collectText(view.toJSON())).toContain("torneos@pkrr.io");
  });

  it("hides the hostname link and falls back to a generic dialog title when the ticket URL is unparsable", () => {
    mockEvent = { id: "community-test", website: "not a valid url" };
    const view = renderScreen();
    act(() => findButton(view, "Purchase Tickets").props.onPress());
    const text = collectText(view.toJSON());

    expect(text).not.toContain("Tickets provided by");
    expect(text).toContain("External ticketing");
  });

  it("keeps third-party ticket pages out of the native app WebView", () => {
    Platform.OS = "ios";
    const view = renderScreen();
    act(() => findButton(view, "Purchase Tickets").props.onPress());

    expect(view.root.findAllByType("WebView" as any)).toHaveLength(0);
    expect(view.root.findAllByType("iframe" as any)).toHaveLength(0);
  });

  it("embeds the PKRR ticket page in the web modal with a direct-link fallback", () => {
    Platform.OS = "web";
    mockEvent = {
      id: "hash-poker",
      cta: { label: "Reserve seat", url: "https://pkrr.io/reg/current-tournament" },
    };
    const view = renderScreen();
    act(() => findButton(view, "Purchase Tickets").props.onPress());

    expect(view.root.findAllByType("WebView" as any)).toHaveLength(0);
    const iframe = view.root.findByType("iframe" as any);
    expect(iframe.props.src).toBe("https://pkrr.io/reg/current-tournament");
    expect(collectText(view.toJSON())).toContain("If PKRR blocks embedded viewing");
  });
});
