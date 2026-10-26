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
});
