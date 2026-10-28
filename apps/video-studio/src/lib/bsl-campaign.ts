import campaign from "../content/bsl-bogota-campaign.json";
import type {BslCampaignFilmConfig} from "../types/BslCampaign.types";

export const BSL_CAMPAIGN = campaign;

export function validateBslCampaign(): void {
  if (BSL_CAMPAIGN.eventId !== "colombia2026") throw new Error("BSL campaign event mismatch");
  if (BSL_CAMPAIGN.timeZone !== "America/Bogota") throw new Error("BSL campaign timezone mismatch");
  if (BSL_CAMPAIGN.films.length !== 3) throw new Error("BSL campaign requires three films");
  if (BSL_CAMPAIGN.films.map((film: BslCampaignFilmConfig) => film.durationSeconds).join(",") !== "50,30,90") {
    throw new Error("BSL campaign durations must be 50, 30 and 90 seconds");
  }
  if (Date.parse(BSL_CAMPAIGN.recapCaptureAt) >= Date.parse(BSL_CAMPAIGN.closesAt)) {
    throw new Error("BSL recap capture must precede the banner switch");
  }
}

export function isBslRecapActive(now: number = Date.now()): boolean {
  return now >= Date.parse(BSL_CAMPAIGN.closesAt);
}
