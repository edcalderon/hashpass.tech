import { Platform } from 'react-native';

export const clubTheme = {
  colors: {
    canvas: '#050816',
    canvasAlt: '#08101D',
    surface: '#0D1728',
    surfaceRaised: '#13213A',
    surfaceTint: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(163, 183, 214, 0.18)',
    borderStrong: 'rgba(206, 221, 247, 0.28)',
    text: '#F5F7FB',
    muted: '#AEB9CB',
    faint: '#738199',
    accent: '#86B6FF',
    accentStrong: '#5E8DE6',
    accentWarm: '#D6A55C',
    accentSoft: 'rgba(134, 182, 255, 0.18)',
    success: '#56D49F',
    warning: '#F0C66E',
    danger: '#EA7A7A',
    overlay: 'rgba(255, 255, 255, 0.06)',
  },
  radius: {
    xs: 10,
    sm: 14,
    md: 18,
    lg: 24,
    xl: 32,
    pill: 999,
  },
  spacing: {
    2: 2,
    4: 4,
    6: 6,
    8: 8,
    10: 10,
    12: 12,
    14: 14,
    16: 16,
    18: 18,
    20: 20,
    24: 24,
    28: 28,
    32: 32,
    40: 40,
    48: 48,
    56: 56,
    64: 64,
  },
  shadows: {
    soft: Platform.select({
      web: {
        boxShadow: '0px 10px 18px rgba(0, 0, 0, 0.24)',
      },
      default: {
        shadowColor: '#000000',
        shadowOpacity: 0.24,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
      },
    }),
    card: Platform.select({
      web: {
        boxShadow: '0px 14px 24px rgba(0, 0, 0, 0.28)',
      },
      default: {
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 12,
      },
    }),
  },
  fonts: {
    body: Platform.select({
      web: 'var(--font-body), "Avenir Next", "Helvetica Neue", Helvetica, sans-serif',
      default: 'System',
    }),
    display: Platform.select({
      web: 'var(--font-display), Georgia, "Times New Roman", serif',
      default: 'Georgia',
    }),
    mono: Platform.select({
      web: 'var(--font-mono), "SFMono-Regular", "SF Mono", Menlo, monospace',
      default: 'Menlo',
    }),
  },
} as const;

export type ClubTheme = typeof clubTheme;
