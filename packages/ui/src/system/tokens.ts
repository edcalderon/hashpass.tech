/** HASHPASS foundation. Geometry is shared across web/native and product skins. */
const hashpassBrand = {
  red: '#af0d01',
  cyan: '#0e7490',
} as const;

export const uiTokens = {
  radius: { card: 24, media: 16, input: 12, small: 8, pill: 999, circle: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48, hero: 64 },
  effects: {
    modalBlur: 16,
    cardShadow: "0 8px 24px rgba(0, 12, 32, 0.08)",
    dialogShadow: "0 24px 80px rgba(0, 12, 32, 0.28)",
    mediaOverlayStrong: "rgba(3, 12, 24, 0.82)",
    mediaOverlayGlass: "rgba(3, 12, 24, 0.42)",
    mediaOverlayBlur: 16,
    mediaBorder: "rgba(255, 255, 255, 0.45)",
    /** Opaque base that photo badges tint over, so an expanded badge hides what it covers. */
    mediaChipBase: "#071b2e",
    mediaVenueScrim: "rgba(3, 12, 24, 0.48)",
  },
  control: { minHeight: 48, compactHeight: 44, badgeHeight: 32, borderWidth: 1 },
  type: { caption: 12, label: 14, body: 16, title: 24, heading: 32, display: 40 },
  motion: { fast: 160, normal: 240, entrance: 520, stagger: 70, easeOut: [0.22, 1, 0.36, 1] as const },
  colors: {
    light: { overlay: '#123d6670', canvas: '#ffffff', surface: '#f7f9fa', raised: '#ffffff', border: '#dfe3e8', text: '#17181c', muted: '#565963', accent: hashpassBrand.red, accentFill: hashpassBrand.red, onAccent: '#ffffff', accentSoft: '#fff1f0', vipFill: '#8a5a00', onVip: '#ffffff', danger: '#b42318', success: '#187548' },
    dark: { overlay: '#071b2eb8', canvas: '#111114', surface: '#19191f', raised: '#22222a', border: '#34343e', text: '#fafafa', muted: '#b0b0bc', accent: '#22d3ee', accentFill: hashpassBrand.cyan, onAccent: '#ffffff', accentSoft: '#142c32', vipFill: '#fbbf24', onVip: '#17181c', danger: '#ff8a80', success: '#63d79a' },
  },
  feature: {
    cyan: '#06b6d4',
    red: hashpassBrand.red,
    violet: '#8b5cf6',
    green: '#22c55e',
    amber: '#f59e0b',
  },
  status: {
    passive: '#2563EB',
    used: '#5E5CE6',
    cancelled: '#6B7280',
  },
  /**
   * Categorical hues for markers that must be told apart at a glance (speaker
   * status dots, meeting purposes). Every value reaches 3:1 against `raised` for
   * graphics and 4.5:1 on its own 14-22% tint, so it may colour an icon. Titles
   * and labels stay on `text`; the hue marks, it does not carry the words.
   */
  speakerStatus: {
    light: { active: '#187548', passive: '#1d4ed8', dnd: '#6d28d9', inactive: '#6b7280', past: '#6b7280' },
    dark: { active: '#63d79a', passive: '#60a5fa', dnd: '#a78bfa', inactive: '#9ca3af', past: '#9ca3af' },
  },
  intention: {
    light: { coffee: '#a21caf', pitch: '#6d28d9', advice: '#0f766e', collaboration: '#166534', networking: '#1d4ed8' },
    dark: { coffee: '#f0abfc', pitch: '#c4b5fd', advice: '#5eead4', collaboration: '#86efac', networking: '#93c5fd' },
  },
} as const;
const HEX_COLOR = /^#([0-9a-f]{6})$/i;
const rgbChannels = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
/**
 * Opaque blend of `foreground` over `base` at `alpha` (0-1). Unlike an 8-digit hex tint it
 * never lets what is underneath show through, so a chip that grows over text stays legible.
 * Falls back to `foreground` when either colour is not `#rrggbb`.
 */
export const mixHex = (foreground: string, base: string, alpha: number): string => {
  if (!HEX_COLOR.test(foreground) || !HEX_COLOR.test(base)) return foreground;
  const fg = rgbChannels(foreground);
  const bg = rgbChannels(base);
  return `#${fg.map((channel, index) => Math.round(channel * alpha + bg[index] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
};
/** `#rrggbb` plus a 0-255 alpha as `#rrggbbaa`; any other colour passes through. */
export const withAlpha = (color: string, alpha: number): string =>
  HEX_COLOR.test(color) ? `${color}${Math.round(alpha).toString(16).padStart(2, '0')}` : color;
export type ColorMode = 'light' | 'dark';
export const uiPalette = (dark: boolean | ColorMode) => uiTokens.colors[dark === true || dark === 'dark' ? 'dark' : 'light'];

/**
 * Every solid fill token has a paired `on*` token that is guaranteed to reach
 * WCAG AA (4.5:1) in both modes. Put text/icons on a fill with its pair, never
 * a literal `#fff` or another mode-dependent text colour.
 */
export const onFillPairs = [
  ['accentFill', 'onAccent'],
  ['vipFill', 'onVip'],
] as const;
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (foreground: string, background: string) => {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
