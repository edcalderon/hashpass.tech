/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readAuthSource = () =>
  readFileSync(resolve(__dirname, "../../app/(shared)/auth.tsx"), "utf8");

describe("desktop auth event-allies carousel", () => {
  it("lists the current event allies in an infinitely repeating rail", () => {
    const source = readAuthSource();

    expect(source).toContain('name: "Blockchain Summit Latam"');
    expect(source).toContain('name: "Hash Poker Room"');
    expect(source).toContain('name: "CriptoLatinFest"');
    expect(source).toContain(
      "const allyRailItems = [...EVENT_ALLIES, ...EVENT_ALLIES];",
    );
    expect(source).toContain("Animated.loop(");
  });

  it("respects reduced-motion preferences while keeping the allies labelled", () => {
    const source = readAuthSource();

    expect(source).toContain('if (animationLevel !== "full")');
    expect(source).toContain(
      'accessibilityLabel="Event platforms using HashPass"',
    );
    expect(source).toContain("accessibilityLabel={ally.name}");
  });
});
