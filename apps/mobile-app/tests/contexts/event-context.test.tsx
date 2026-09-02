import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockRefreshHashPokerRuntimeEvent = jest.fn();
const mockGetCurrentEvent = jest.fn();

jest.mock("expo-router", () => ({ usePathname: () => "/events/hash-poker/home" }));
jest.mock("../../lib/runtime-event-registry", () => ({
  refreshHashPokerRuntimeEvent: () => mockRefreshHashPokerRuntimeEvent(),
}));
jest.mock("../../lib/event-detector", () => ({
  getRouteEventIdFromPathname: () => "hash-poker",
  getCurrentEvent: (...args: unknown[]) => mockGetCurrentEvent(...args),
}));
jest.mock("../../config/events", () => ({
  EVENTS: { "hash-poker": { id: "hash-poker", title: "Hash Poker", features: [] } },
}));
jest.mock("@hashpass/config", () => ({
  ENV_CONFIG: { getTenant: () => ({ id: "main" }) },
}));

import { EventProvider, useEvent } from "../../contexts/EventContext";

const Probe = () => {
  const { event } = useEvent();
  return <span>{event?.title}</span>;
};

describe("EventProvider runtime registry refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentEvent.mockReturnValue({ id: "hash-poker" });
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

    await act(async () => {
      TestRenderer.create(<EventProvider><Probe /></EventProvider>);
      await Promise.resolve();
    });

    expect(mockRefreshHashPokerRuntimeEvent).not.toHaveBeenCalled();
  });
});
