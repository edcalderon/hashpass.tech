import test from "node:test";
import assert from "node:assert/strict";
import campaign from "../src/content/bsl-bogota-campaign.json" with {type: "json"};

test("BSL campaign has the requested durations and Bogotá schedule", () => {
  assert.equal(campaign.eventId, "colombia2026");
  assert.deepEqual(campaign.films.map((film) => film.durationSeconds), [50, 30, 90]);
  assert.equal(Date.parse(campaign.closesAt), Date.parse("2026-11-06T23:00:00.000Z"));
});
