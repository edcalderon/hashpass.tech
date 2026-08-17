/// <reference types="jest" />

// Regression coverage for a real security bug: this redirector used to send
// EVERY visitor -- logged in or not -- into /(shared)/dashboard/explore, a
// protected route, with no auth check at all. See
// apps/docs/docs/auth/AUTH_FLOW.md ("Logged-out visitors must never render
// the dashboard") for the full incident writeup.

const mockIsLoggedIn = { current: false };
const mockIsLoading = { current: false };
const mockDevBypass = { current: false };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ eventSlug: "colombia2026" }),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({
    isLoggedIn: mockIsLoggedIn.current,
    isLoading: mockIsLoading.current,
  }),
}));

jest.mock("../../../lib/auth/dev-bypass", () => ({
  isDevAuthBypassEnabled: () => mockDevBypass.current,
}));

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import EventHomeRedirect from "../../../app/events/[eventSlug]/home";

const renderRedirector = () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<EventHomeRedirect />);
  });
  return renderer;
};

describe("events/[eventSlug]/home redirector", () => {
  beforeEach(() => {
    mockIsLoggedIn.current = false;
    mockIsLoading.current = false;
    mockDevBypass.current = false;
  });

  it("sends a logged-in visitor to the dashboard explorer, carrying eventId", () => {
    mockIsLoggedIn.current = true;
    const renderer = renderRedirector();
    expect(renderer.toJSON()).toBe(
      "Redirect:/(shared)/dashboard/explore?eventId=colombia2026",
    );
    act(() => renderer.unmount());
  });

  it("sends a logged-out visitor to the event's public info page, never the dashboard (regression)", () => {
    mockIsLoggedIn.current = false;
    const renderer = renderRedirector();
    expect(renderer.toJSON()).toBe(
      "Redirect:/events/colombia2026/event-info",
    );
    act(() => renderer.unmount());
  });

  it("renders nothing while auth is still resolving, instead of guessing", () => {
    mockIsLoading.current = true;
    const renderer = renderRedirector();
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  it("dev auth bypass sends a logged-out visitor to the dashboard (local-dev-only escape hatch)", () => {
    mockIsLoggedIn.current = false;
    mockDevBypass.current = true;
    const renderer = renderRedirector();
    expect(renderer.toJSON()).toBe(
      "Redirect:/(shared)/dashboard/explore?eventId=colombia2026",
    );
    act(() => renderer.unmount());
  });

  it("dev auth bypass skips the loading guard too", () => {
    mockIsLoading.current = true;
    mockDevBypass.current = true;
    const renderer = renderRedirector();
    expect(renderer.toJSON()).toBe(
      "Redirect:/(shared)/dashboard/explore?eventId=colombia2026",
    );
    act(() => renderer.unmount());
  });
});
