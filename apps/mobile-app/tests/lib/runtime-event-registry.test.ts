import { refreshHashPokerRuntimeEvent } from "../../lib/runtime-event-registry";
import type { EventConfig } from "@hashpass/types";

const mockEvents: Record<string, EventConfig> = {};

describe("runtime event registry", () => {
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    delete mockEvents["hash-poker"];
  });

  it("installs the database-published Hash Poker configuration", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.test/api/";
    const config = {
      id: "hash-poker",
      title: "Database tournament",
      eventStartDate: "2026-08-18T23:05:00.000Z",
      eventType: "whitelabel",
    };
    const requested: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json({ data: config, source: "database" });
    };

    await expect(refreshHashPokerRuntimeEvent(fetchImpl as typeof fetch, mockEvents)).resolves.toBe(true);
    expect(requested).toEqual(["https://api.example.test/api/event-sources/hash-poker"]);
    expect(mockEvents["hash-poker"]).toEqual(config);
  });

  it("rejects an invalid event without changing the registry", async () => {
    mockEvents["hash-poker"] = { id: "hash-poker", title: "Existing" } as EventConfig;
    const fetchImpl = async () => Response.json({ data: { id: "other" } });

    await expect(refreshHashPokerRuntimeEvent(fetchImpl as typeof fetch, mockEvents)).rejects.toThrow(/invalid/);
    expect(mockEvents["hash-poker"]).toEqual({ id: "hash-poker", title: "Existing" });
  });

  it("uses the same-origin endpoint and reports an unchanged configuration", async () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    const config = {
      id: "hash-poker",
      title: "Existing tournament",
      eventStartDate: "2026-08-18T23:05:00.000Z",
      eventType: "whitelabel",
    } as EventConfig;
    mockEvents["hash-poker"] = config;
    const fetchImpl = jest.fn(async () => Response.json({ data: config }));

    await expect(refreshHashPokerRuntimeEvent(fetchImpl as typeof fetch, mockEvents)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith("/api/event-sources/hash-poker");
  });

  it("rejects an unsuccessful event-feed response", async () => {
    const fetchImpl = async () => Response.json({ error: "offline" }, { status: 503 });

    await expect(refreshHashPokerRuntimeEvent(fetchImpl as typeof fetch, mockEvents)).rejects.toThrow(
      "Event feed responded 503",
    );
  });
});
