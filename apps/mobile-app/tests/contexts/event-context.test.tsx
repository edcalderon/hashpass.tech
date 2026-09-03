import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockRefreshHashPokerRuntimeEvent = jest.fn();
const mockGetCurrentEvent = jest.fn();
const mockGetRouteEventIdFromPathname = jest.fn();
const mockGetAvailableEvents = jest.fn();
const mockGetTenant = jest.fn();

jest.mock("expo-router", () => ({ usePathname: () => "/events/hash-poker/home" }));
jest.mock("../../lib/runtime-event-registry", () => ({
  refreshHashPokerRuntimeEvent: () => mockRefreshHashPokerRuntimeEvent(),
}));
jest.mock("../../lib/event-detector", () => ({
  getRouteEventIdFromPathname: () => mockGetRouteEventIdFromPathname(),
  getCurrentEvent: (...args: unknown[]) => mockGetCurrentEvent(...args),
  getAvailableEvents: (...args: unknown[]) => mockGetAvailableEvents(...args),
}));
jest.mock("../../config/events", () => ({
  EVENTS: { "hash-poker": { id: "hash-poker", title: "Hash Poker", features: [] } },
}));
jest.mock("@hashpass/config", () => ({
  ENV_CONFIG: { getTenant: () => mockGetTenant() },
}));

import { EventProvider, useEvent } from "../../contexts/EventContext";

const Probe = () => {
  const { event } = useEvent();
  return <span>{event?.title}</span>;
};

describe("EventProvider runtime registry refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteEventIdFromPathname.mockReturnValue("hash-poker");
    mockGetCurrentEvent.mockReturnValue({ id: "hash-poker" });
    mockGetAvailableEvents.mockReturnValue([{ id: "hash-poker" }]);
    mockGetTenant.mockReturnValue({ id: "main" });
  });

  it("refreshes the runtime registry and rerenders after a change", async () => {
    mockRefreshHashPokerRuntimeEvent.mockResolvedValue(true);
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<EventProvider><Probe /></EventProvider>);
      await Promise.resolve();
    });

    expect(mockRefreshHashPokerRuntimeEvent).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType("span").children).toEqual(["Hash Poker"]);
    act(() => renderer!.unmount());
  });

  it("logs refresh failures without breaking its children", async () => {
    const error = new Error("feed offline");
    mockRefreshHashPokerRuntimeEvent.mockRejectedValue(error);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      TestRenderer.create(<EventProvider><Probe /></EventProvider>);
      await Promise.resolve();
    });

    expect(consoleError).toHaveBeenCalledWith("[HashPass] Event registry refresh failed", error);
    consoleError.mockRestore();
  });

  it("does not refresh the Hash Poker feed for another event tenant", async () => {
    mockGetCurrentEvent.mockReturnValue({ id: "cbweek2026" });
    mockGetAvailableEvents.mockReturnValue([{ id: "cbweek2026" }]);
    mockGetTenant.mockReturnValue({ id: "cbweek2026" });

    await act(async () => {
      TestRenderer.create(<EventProvider><Probe /></EventProvider>);
      await Promise.resolve();
    });

    expect(mockRefreshHashPokerRuntimeEvent).not.toHaveBeenCalled();
  });

  it("refreshes Hash Poker while the global explorer renders its slide", async () => {
    mockGetRouteEventIdFromPathname.mockReturnValue(undefined);
    mockGetCurrentEvent.mockReturnValue({ id: "default" });
    mockGetAvailableEvents.mockReturnValue([{ id: "bsl" }, { id: "hash-poker" }]);
    mockGetTenant.mockReturnValue({ id: "main" });
    mockRefreshHashPokerRuntimeEvent.mockResolvedValue(false);

    await act(async () => {
      TestRenderer.create(<EventProvider><Probe /></EventProvider>);
      await Promise.resolve();
    });

    expect(mockRefreshHashPokerRuntimeEvent).toHaveBeenCalledTimes(1);
  });
});
