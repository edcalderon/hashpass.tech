/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import de from "../../i18n/locales/de.json";
import en from "../../i18n/locales/en.json";
import es from "../../i18n/locales/es.json";
import fr from "../../i18n/locales/fr.json";
import ko from "../../i18n/locales/ko.json";
import pt from "../../i18n/locales/pt.json";

const readAuthSource = () =>
  readFileSync(resolve(__dirname, "../../app/(shared)/auth.tsx"), "utf8");

describe("desktop auth event-allies carousel", () => {
  it("lists only the current tenant's allowed allies in an infinitely repeating rail", () => {
    const source = readAuthSource();

    expect(source).toContain('eventApiPath(activeEventId, "auth-allies")');
    expect(source).toContain("getConfiguredAuthAllyIds(EVENTS[activeEventId])");
    expect(source).toContain("getAuthAllies(allowedAuthAllyIds)");
    expect(source).toContain("normalizeAuthAllyIds(payload.allowedAllyIds)");
    expect(source).toMatch(
      /animationLevel === "full"\s*\? \[\.\.\.eventAllies, \.\.\.eventAllies\]\s*: eventAllies/,
    );
    expect(source).toContain("Animated.loop(");
  });

  it("cycles the desktop value proposition, but starts with events when motion is disabled", () => {
    const source = readAuthSource();

    expect(source).toContain('if (animationLevel !== "full")');
    expect(source).toContain('if (animationLevel === "none")');
    expect(source).toContain("setActiveHeroModeIndex(0);");
    expect(source).toContain("desktopHero.modes.concerts");
    expect(source).toContain("desktopHero.modes.clubs");
    expect(source).toContain("onHoverIn={() => {");
    expect(source).toContain("accessibilityLabel={ally.name}");
  });

  it("shows every ally once in a wrapping static rail when motion is reduced or disabled", () => {
    const source = readAuthSource();

    expect(source).toMatch(
      /animationLevel === "full"\s*\? \[\.\.\.eventAllies, \.\.\.eventAllies\]\s*: eventAllies/,
    );
    expect(source).toContain(
      'animationLevel === "full" ? null : styles.desktopHeroRailStatic',
    );
    expect(source).toContain("desktopHeroRailStatic: {");
    expect(source).toContain('flexWrap: "wrap"');
  });

  it.each([
    ["en", en],
    ["es", es],
    ["fr", fr],
    ["pt", pt],
    ["de", de],
    ["ko", ko],
  ])("localizes every desktop hero message in %s", (_locale, catalog) => {
    expect(catalog.auth.desktopHero).toEqual(
      expect.objectContaining({
        eyebrow: expect.any(String),
        title: expect.any(String),
        alliesLabel: expect.any(String),
        alliesAccessibilityLabel: expect.any(String),
        allyBadge: expect.any(String),
      }),
    );
    expect(catalog.auth.desktopHero.modes).toEqual(
      expect.objectContaining({
        events: expect.any(String),
        clubs: expect.any(String),
        concerts: expect.any(String),
      }),
    );
  });
});
