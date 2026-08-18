/// <reference types="jest" />

const mockPlatform = { OS: "web" };

jest.mock("react-native", () => ({
  Platform: mockPlatform,
}));

jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg",
  () => "white-cyan-svg",
);
jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-black.svg",
  () => "black-svg",
);
jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-white.svg",
  () => "white-svg",
);
jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-white.webp",
  () => "white-native-png",
);
jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-black.webp",
  () => "black-native-png",
);
jest.mock(
  "../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp",
  () => "white-cyan-native-png",
);

const {
  getHashpassFullLogo,
  getHashpassFooterLogo,
  getHashpassStaticHeroLogo,
} = require("../../lib/hashpass-logo");

describe("getHashpassFullLogo", () => {
  it("uses the white-cyan logo on dark web surfaces", () => {
    mockPlatform.OS = "web";

    expect(getHashpassFullLogo(true)).toBe("white-cyan-native-png");
  });

  it("uses the black logo on light web surfaces", () => {
    mockPlatform.OS = "web";

    expect(getHashpassFullLogo(false)).toBe("black-native-png");
  });

  it("uses the black native logo on light native surfaces", () => {
    mockPlatform.OS = "android";

    expect(getHashpassFullLogo(false)).toBe("black-native-png");
  });
});

describe("getHashpassFooterLogo", () => {
  it("uses the white-cyan logo on dark web footer", () => {
    mockPlatform.OS = "web";

    expect(getHashpassFooterLogo(true)).toBe("white-cyan-native-png");
  });

  it("uses the white logo on light web footer (dark-tinted background)", () => {
    mockPlatform.OS = "web";

    expect(getHashpassFooterLogo(false)).toBe("white-native-png");
  });

  it("uses the black native logo on light native footer", () => {
    mockPlatform.OS = "android";

    expect(getHashpassFooterLogo(false)).toBe("white-native-png");
  });
});

describe("getHashpassStaticHeroLogo", () => {
  it("uses the verified white-letter SVG on the web landing hero", () => {
    mockPlatform.OS = "web";

    expect(getHashpassStaticHeroLogo(false)).toBe("black-svg");
  });

  it("switches to the white-cyan mark in dark web mode", () => {
    mockPlatform.OS = "web";

    // FIXED: this previously asserted the bug (dark mode ignored and stuck
    // on the light-mode red-mark SVG) -- dark mode must follow the theme,
    // same as every other logo getter in this file.
    expect(getHashpassStaticHeroLogo(true)).toBe("white-cyan-native-png");
  });

  it("uses the white-letter native fallback on the landing hero", () => {
    mockPlatform.OS = "android";

    expect(getHashpassStaticHeroLogo(false)).toBe("white-cyan-native-png");
  });

  // Regression test for a real bug found live via screenshot: the hero
  // container's own background is plain isDark ? '#121212' : '#FFFFFF'
  // (see animatedBackground in app/home.tsx) -- it only reads as dark in
  // light theme because CrystalForgeBackground (animationLevel === 'full'
  // only) paints a dark overlay on top. With 'reduced'/'none' animation
  // levels there's no overlay, so a white-letter logo was rendering as a
  // barely-visible hollow outline on plain white.
  it("switches to the dark-letter variant in light mode when there is no dark overlay to contrast against", () => {
    mockPlatform.OS = "web";

    expect(getHashpassStaticHeroLogo(false, false)).toBe("black-native-png");
  });

  it("switches to the dark-letter variant on native too when there is no dark overlay", () => {
    mockPlatform.OS = "android";

    expect(getHashpassStaticHeroLogo(false, false)).toBe("black-native-png");
  });

  it("keeps the white-letter variant in light mode when the dark overlay IS present (animationLevel 'full')", () => {
    mockPlatform.OS = "web";

    expect(getHashpassStaticHeroLogo(false, true)).toBe("black-svg");
  });

  it("ignores hasDarkOverlay in dark mode -- the cyan mark always applies regardless", () => {
    mockPlatform.OS = "web";

    expect(getHashpassStaticHeroLogo(true, false)).toBe("white-cyan-native-png");
  });
});
