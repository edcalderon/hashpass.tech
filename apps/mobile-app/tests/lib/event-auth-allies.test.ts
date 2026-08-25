import {
  DEFAULT_AUTH_ALLY_ID,
  getConfiguredAuthAllyIds,
  normalizeAuthAllyIds,
} from "../../lib/event-auth-allies";
import { EVENTS } from "../../config/events";

describe("event auth allies", () => {
  it("always includes Hash Poker Room as the default event ally", () => {
    expect(normalizeAuthAllyIds([])).toEqual([DEFAULT_AUTH_ALLY_ID]);
    expect(normalizeAuthAllyIds(["bsl"])).toEqual([
      DEFAULT_AUTH_ALLY_ID,
      "bsl",
    ]);
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
      getConfiguredAuthAllyIds({ authAllyIds: ["hash-poker-room"] }),
    ).toEqual(["hash-poker-room"]);
  });

  it("does not expose BSL in the CriptoLatinFest tenant fallback", () => {
    expect(getConfiguredAuthAllyIds(EVENTS.criptolatinfest)).toEqual([
      "hash-poker-room",
    ]);
  });
});
