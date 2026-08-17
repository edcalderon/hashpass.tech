/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

let mockEvent: Record<string, unknown> | null = null;

jest.mock("@contexts/EventContext", () => ({
  useEvent: () => ({ event: mockEvent }),
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

jest.mock("../../../lib/api-client", () => ({
  getRuntimeApiBaseUrl: () => "https://api.hashpass.tech/api",
}));

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import EventInfoScreen from "../../../app/events/[eventSlug]/event-info";

const COLOMBIA_EVENT = {
  id: "colombia2026",
  title: "Blockchain Summit Latam Colombia 2026",
  subtitle: "Bogotá, Colombia",
  website: "https://blockchainsummit.la/colombia2026/",
  eventStartDate: "2026-11-05T09:00:00-05:00",
  eventDateString: "November 5-6, 2026",
};

const HASH_POKER_EVENT = {
  id: "hash-poker",
  title: "50K Turbo",
  subtitle: "Poker Room • Hash House Club, Medellín",
};

const originalFetch = global.fetch;

function findAllText(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType("Text" as any)
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string");
}

async function renderScreen(fetchImpl: typeof fetch) {
  global.fetch = fetchImpl as typeof fetch;
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
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("shows the real DB description, venue, and website for an event with a details row", async () => {
    mockEvent = COLOMBIA_EVENT;
    const renderer = await renderScreen(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            description: "The real Colombia 2026 description from the DB.",
            venue_name: "Corferias",
            venue_address: "Cra 40 #22C-67, Bogotá",
            city: "Bogotá",
            country: "Colombia",
          },
        }),
      }) as unknown as typeof fetch,
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
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      }) as unknown as typeof fetch,
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
      jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch,
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).toContain("Poker Room • Hash House Club, Medellín");
    act(() => renderer.unmount());
  });

  it("does not render a contact section when the event has no real website or address", async () => {
    mockEvent = { id: "bsl", title: "BSL On Tour", subtitle: "Roadshow" };
    const renderer = await renderScreen(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      }) as unknown as typeof fetch,
    );

    const text = findAllText(renderer).join(" | ");
    expect(text).not.toContain("Contact");
    act(() => renderer.unmount());
  });
});
