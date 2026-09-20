/** HASHPASS foundation. Geometry is shared across web/native and product skins. */
export const uiTokens = {
  radius: { card: 24, media: 16, input: 12, small: 8, pill: 999, circle: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48, hero: 64 },
  effects: { modalBlur: 16, dialogShadow: "0 24px 80px rgba(0, 12, 32, 0.28)" },
  control: { minHeight: 48, compactHeight: 44, badgeHeight: 32, borderWidth: 1 },
  type: { caption: 12, label: 14, body: 16, title: 24, heading: 32, display: 40 },
  motion: { fast: 160, normal: 240, entrance: 520, stagger: 70, easeOut: [0.22, 1, 0.36, 1] as const },
  colors: {
    light: { overlay: '#123d6670', canvas: '#ffffff', surface: '#f7f9fa', raised: '#ffffff', border: '#dfe3e8', text: '#17181c', muted: '#565963', accent: '#0e7490', accentFill: '#0e7490', onAccent: '#ffffff', accentSoft: '#ecf8fb', danger: '#b42318', success: '#187548' },
    dark: { overlay: '#071b2eb8', canvas: '#111114', surface: '#19191f', raised: '#22222a', border: '#34343e', text: '#fafafa', muted: '#b0b0bc', accent: '#22d3ee', accentFill: '#0e7490', onAccent: '#ffffff', accentSoft: '#142c32', danger: '#ff8a80', success: '#63d79a' },
  },
} as const;
export type ColorMode = 'light' | 'dark';
export const uiPalette = (dark: boolean | ColorMode) => uiTokens.colors[dark === true || dark === 'dark' ? 'dark' : 'light'];
