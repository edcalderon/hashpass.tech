import {
  DEFAULT_AUTH_ALLY_ID,
  getEventAuthAllies,
  getConfiguredAuthAllyIds,
  normalizeAuthAllyIds,
} from "../../lib/event-auth-allies";
import { EVENTS } from "../../config/events";

describe("event auth allies", () => {
  it("always includes Hash Poker Room exactly once as the platform ally", () => {
    expect(normalizeAuthAllyIds([])).toEqual([DEFAULT_AUTH_ALLY_ID]);
    expect(normalizeAuthAllyIds(["hash-poker-room", "hash-poker-room"])).toEqual([
      DEFAULT_AUTH_ALLY_ID,
    ]);
    expect(normalizeAuthAllyIds(["bsl"])).toEqual([DEFAULT_AUTH_ALLY_ID, "bsl"]);
  });

  it("keeps only known, unique ally ids", () => {
    expect(
      normalizeAuthAllyIds([
        "BSL",
        "unknown-ally",
        "hash-poker-room",
        "bsl",
      ]),
    ).toEqual([DEFAULT_AUTH_ALLY_ID, "bsl"]);
  });

  it("uses the event configuration as its static tenant fallback", () => {
    expect(
      getConfiguredAuthAllyIds(EVENTS.cbweek2026),
    ).toEqual([DEFAULT_AUTH_ALLY_ID]);
  });

  it("always uses the host event's official logo before optional partners", () => {
    const bsl = getEventAuthAllies(EVENTS.bsl, ["hash-poker-room"]);
    const cbw = getEventAuthAllies(EVENTS.cbweek2026, ["hash-poker-room"]);

    expect(bsl[0]).toMatchObject({
      id: "bsl",
      name: "BSL",
      logo: { uri: EVENTS.bsl.branding.logo },
    });
    expect(cbw[0]).toMatchObject({
      id: "cbweek2026",
      name: "CBW",
      logo: { uri: EVENTS.cbweek2026.branding.logo },
    });
    expect(cbw[0].logo).not.toEqual(bsl[0].logo);
    expect(cbw.filter((ally) => ally.id === DEFAULT_AUTH_ALLY_ID)).toHaveLength(1);
  });
});
