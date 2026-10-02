/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

let mockEvent: Record<string, unknown> | null = null;
let mockAnimationLevel: "full" | "reduced" | "none" = "full";
const mockGetEventDetails = jest.fn();
const mockRouterPush = jest.fn();

jest.mock("@contexts/EventContext", () => ({
  useEvent: () => ({ event: mockEvent }),
}));

// Avoids pulling in the real expo-router/@react-navigation/native-stack
// machinery, which the RN test environment here can't fully mock (fails
// with "Animated.createAnimatedComponent is not a function") -- see the
// "Get Tickets" CTA's router.push usage below.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { default: "#FFFFFF", paper: "#F5F5F5" },
      text: { primary: "#111111", secondary: "#666666" },
      divider: "#E5E5E5",
    },
  }),
}));

jest.mock("@expo/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));

jest.mock("../../../components/EventBanner", () => "EventBanner");

jest.mock("../../../contexts/AnimationLevelContext", () => ({
  useAnimationLevel: () => ({ animationLevel: mockAnimationLevel }),
}));

jest.mock("../../../lib/api-client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGetEventDetails(...args) },
  eventApiPath: (eventId: string, resource: string) =>
    `events/${eventId}/${resource}`,
}));

import React from "react";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import EventInfoScreen from "../../../app/events/[eventSlug]/event-info";

const COLOMBIA_EVENT = {
  id: "colombia2026",
  title: "Blockchain Summit Latam Colombia 2026",
  subtitle: "Bogotá, Colombia",
  website: "https://blockchainsummit.la/colombia2026/",
  eventStartDate: "2026-11-05T09:00:00-05:00",
  eventDateString: "November 5-6, 2026",
  image: "https://cdn.example.test/colombia-poster.webp",
  heroVideo: "https://cdn.example.test/colombia-film.mp4",
};

const HASH_POKER_EVENT = {
  id: "hash-poker",
  title: "50K Turbo",
  subtitle: "Poker Room • Hash House Club, Medellín",
};

const setViewportWidth = (width: number) => {
  jest
    .spyOn(require("react-native"), "useWindowDimensions")
    .mockReturnValue({ width, height: 844, scale: 1, fontScale: 1 });
};

function findAllText(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType("Text" as any)
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string");
}

async function renderScreen(detailsResponse: unknown) {
  mockGetEventDetails.mockResolvedValue(detailsResponse);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<EventInfoScreen />);
    // Flush the details fetch's microtask chain.
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

describe("EventInfoScreen", () => {
  beforeEach(() => {
    mockEvent = null;
    mockGetEventDetails.mockReset();
    mockRouterPush.mockReset();
    setViewportWidth(390);
    mockAnimationLevel = "full";
  });

  it("shows the real DB description, venue, and website for an event with a details row", async () => {
    mockEvent = COLOMBIA_EVENT;
    const renderer = await renderScreen(
      {
        success: true,
        data: {
          data: {
            description: "The real Colombia 2026 description from the DB.",
            venue_name: "Corferias",
            venue_address: "Cra 40 #22C-67, Bogotá",
            city: "Bogotá",
            country: "Colombia",
          },
        },
      },
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).toContain("The real Colombia 2026 description from the DB.");
    expect(text).toContain("Corferias");
    expect(text).toContain("Bogotá, Colombia");
    // Real website link, not a fabricated contact.
    expect(text).toContain("blockchainsummit.la/colombia2026/");
    act(() => renderer.unmount());
  });

  it("falls back to the event's own subtitle, never fabricated copy, when there is no DB row yet", async () => {
    mockEvent = HASH_POKER_EVENT;
    const renderer = await renderScreen(
      { success: true, data: { data: null } },
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).toContain("Poker Room • Hash House Club, Medellín");
    expect(text).not.toContain("Blockchain & FinTech Summit");
    expect(text).not.toContain("Conference Details & Logistics");
    act(() => renderer.unmount());
  });

  it("never crashes and still falls back cleanly when the details fetch itself fails", async () => {
    mockEvent = HASH_POKER_EVENT;
    const renderer = await renderScreen(
      { success: false, data: null, error: "network down" },
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).toContain("Poker Room • Hash House Club, Medellín");
    act(() => renderer.unmount());
  });

  it("does not render a contact section when the event has no real website or address", async () => {
    mockEvent = { id: "bsl", title: "BSL On Tour", subtitle: "Roadshow" };
    const renderer = await renderScreen(
      { success: true, data: { data: null } },
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).not.toContain("Contact");
    act(() => renderer.unmount());
  });

  it("renders the event's real media through the detail banner variant and keeps real links accessible", async () => {
    mockEvent = COLOMBIA_EVENT;
    const renderer = await renderScreen(
      {
        success: true,
        data: {
          data: {
            description: "The real Colombia 2026 description from the DB.",
            venue_name: "Corferias",
            venue_address: "Cra 40 #22C-67, Bogotá",
            city: "Bogotá",
            country: "Colombia",
          },
        },
      },
    );

    try {
      expect(renderer.root.findByType("EventBanner" as any).props).toMatchObject({
        variant: "detail",
        title: COLOMBIA_EVENT.title,
        eventImage: COLOMBIA_EVENT.image,
        eventVideo: COLOMBIA_EVENT.heroVideo,
      });
      const links = renderer.root.findAll(
        (node) => node.props.accessibilityRole === "link",
      );
      expect(links).toHaveLength(2);
      expect(
        renderer.root.findAll((node) => node.props.disabled === true),
      ).toHaveLength(0);
      expect(
        renderer.root
          .findAll((node) => node.props.accessibilityRole === "header")
          .map((node) => node.children.join("")),
      ).toEqual(expect.arrayContaining(["Event Details", "About", "Contact"]));
      expect(links.map((node) => node.props.accessibilityLabel)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("blockchainsummit.la"),
          expect.stringContaining("Cra 40 #22C-67"),
        ]),
      );
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("bounds the content width and reflows from a linear mobile order into two desktop columns", async () => {
    mockEvent = COLOMBIA_EVENT;
    const detailsResponse = {
      success: true,
      data: {
        data: {
          description: "The real Colombia 2026 description from the DB.",
          venue_name: "Corferias",
          venue_address: "Cra 40 #22C-67, Bogotá",
          city: "Bogotá",
          country: "Colombia",
        },
      },
    };
    const renderer = await renderScreen(detailsResponse);

    try {
      const mobileContainer = StyleSheet.flatten(
        renderer.root.findByProps({ testID: "event-info-content" }).props.style,
      );
      const mobileLayout = StyleSheet.flatten(
        renderer.root.findByProps({ testID: "event-info-sections" }).props.style,
      );
      expect(mobileContainer).toMatchObject({ width: "100%", alignSelf: "center" });
      expect(typeof mobileContainer.maxWidth).toBe("number");
      expect(mobileContainer.maxWidth).toBeGreaterThan(720);
      expect(mobileContainer.maxWidth).toBeLessThanOrEqual(1440);
      expect(mobileLayout.flexDirection).toBe("column");
      expect(mobileLayout.marginTop).toBeGreaterThan(0);
      expect(
        renderer.root
          .findAll(
            (node) =>
              typeof node.props.testID === "string" &&
              /^event-info-(details|about|contact)-section$/.test(node.props.testID),
          )
          .map((node) => node.props.testID),
      ).toEqual([
        "event-info-details-section",
        "event-info-about-section",
        "event-info-contact-section",
      ]);

      await act(async () => {
        setViewportWidth(1280);
        renderer.update(<EventInfoScreen />);
        await Promise.resolve();
      });
      const desktopLayout = StyleSheet.flatten(
        renderer.root.findByProps({ testID: "event-info-sections" }).props.style,
      );
      expect(desktopLayout.flexDirection).toBe("row");
      expect(desktopLayout.marginTop).toBeGreaterThan(0);
      expect(
        renderer.root.findAllByProps({ testID: "event-info-column" }),
      ).toHaveLength(2);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("renders a Become a Speaker CTA that opens the event's call-for-speakers link", async () => {
    mockEvent = {
      ...COLOMBIA_EVENT,
      speakerApplicationUrl: "https://colombiablockchainweek.com/ser-speaker#postulacion",
    };
    const renderer = await renderScreen({ success: true, data: { data: null } });

    try {
      const text = findAllText(renderer).join(" | ");
      expect(text).toContain("Become a speaker");

      const { Linking } = require("react-native");
      Linking.openURL.mockReturnValue(Promise.resolve());
      const button = renderer.root.find(
        (node) =>
          node.props.accessibilityRole === "button" &&
          node.props.accessibilityLabel === "Apply to Speak",
      );
      act(() => button.props.onPress());
      expect(Linking.openURL).toHaveBeenCalledWith(
        "https://colombiablockchainweek.com/ser-speaker#postulacion",
      );
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("does not render a Become a Speaker CTA when the event has no call-for-speakers link", async () => {
    mockEvent = COLOMBIA_EVENT;
    const renderer = await renderScreen({ success: true, data: { data: null } });

    try {
      const text = findAllText(renderer).join(" | ");
      expect(text).not.toContain("Become a speaker");
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("keeps detail hero video disabled when the app motion preference is reduced", async () => {
    mockEvent = COLOMBIA_EVENT;
    mockAnimationLevel = "reduced";
    const renderer = await renderScreen(
      { success: true, data: { data: null } },
    );

    try {
      expect(
        renderer.root.findByType("EventBanner" as any).props.videoPlaybackEnabled,
      ).toBe(false);
    } finally {
      act(() => renderer.unmount());
    }
  });
});
