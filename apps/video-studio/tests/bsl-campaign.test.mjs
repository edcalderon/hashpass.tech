import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import campaign from "../src/content/bsl-bogota-campaign.json" with {type: "json"};

test("BSL campaign has the requested durations and Bogotá schedule", () => {
  assert.equal(campaign.eventId, "colombia2026");
  assert.deepEqual(campaign.films.map((film) => film.durationSeconds), [50, 30, 90]);
  assert.equal(Date.parse(campaign.closesAt), Date.parse("2026-11-06T23:00:00.000Z"));
});

test("initial publish generates and validates localized narration before rendering", () => {
  const workflow = readFileSync(
    resolve(import.meta.dirname, "../../../.github/workflows/bsl-campaign-initial-publish.yml"),
    "utf8",
  );
  const install = workflow.indexOf("edge-tts==7.3.1");
  const generate = workflow.indexOf("pnpm --filter hashpass-video-studio bsl:welcome:narration");
  const validate = workflow.indexOf("test -s \"apps/video-studio/public/audio/narration/campaign/$locale/bsl-bogota-welcome.mp3\"");
  const prepareAssets = workflow.indexOf("node apps/video-studio/scripts/prepare-event-hero-assets.mjs");
  const render = workflow.indexOf("node apps/video-studio/scripts/render-bsl-campaign.mjs");

  assert.ok(install >= 0, "workflow must install the pinned edge-tts version");
  assert.ok(generate > install, "workflow must generate narration after installing edge-tts");
  assert.ok(validate > generate, "workflow must validate generated localized assets");
  assert.ok(prepareAssets > validate, "workflow must prepare reviewed event logos before rendering");
  assert.ok(render > prepareAssets, "workflow must render only after narration and logo preparation");
  assert.match(workflow, /test -s "apps\/video-studio\/public\/audio\/subtitles\/campaign\/\$locale\/bsl-bogota-welcome\.vtt"/);
});
