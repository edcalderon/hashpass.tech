/// <reference types="jest" />
import { contrastRatio, onFillPairs, uiTokens } from "@hashpass/ui/tokens";

describe("design token contrast", () => {
  for (const mode of ["light", "dark"] as const) {
    const palette = uiTokens.colors[mode];
    it.each(onFillPairs)(`${mode}: %s carries %s at WCAG AA`, (fill, on) => {
      expect(contrastRatio(palette[on], palette[fill])).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: body and muted text meet WCAG AA on canvas and surface`, () => {
      for (const background of [palette.canvas, palette.surface, palette.raised]) {
        expect(contrastRatio(palette.text, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.muted, background)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  // Categorical hues colour icons and dots only (labels stay on `text`), so they need the 3:1
  // non-text contrast of WCAG 1.4.11 on the card and on the tints components lay under them:
  // MeetingRequestSheet (selected tile 1a, icon chip 24/38) and SpeakerStatusBadge rows (26).
  const blend = (foreground: string, background: string, alpha: number) =>
    `#${[1, 3, 5]
      .map((i) =>
        Math.round(parseInt(foreground.slice(i, i + 2), 16) * alpha + parseInt(background.slice(i, i + 2), 16) * (1 - alpha))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  for (const mode of ["light", "dark"] as const) {
    const raised = uiTokens.colors[mode].raised;
    const chipAlpha = (mode === "light" ? 0x24 : 0x38) / 255;
    const groups = { intention: uiTokens.intention[mode], speakerStatus: uiTokens.speakerStatus[mode] };
    for (const [group, hues] of Object.entries(groups)) {
      it.each(Object.entries(hues))(`${mode}: ${group} hue %s reads as a graphic on its tints`, (_name, hue) => {
        const selectedTile = blend(hue, raised, 0x1a / 255);
        const surfaces = [raised, blend(hue, raised, chipAlpha), blend(hue, selectedTile, chipAlpha), blend(hue, raised, 0x26 / 255)];
        for (const surface of surfaces) expect(contrastRatio(hue, surface)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
