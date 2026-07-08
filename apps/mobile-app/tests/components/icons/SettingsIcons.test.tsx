/// <reference types="jest" />

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Line: 'Line',
}));

import {
  AutoIcon,
  ArrowUpIcon,
  CheckIcon,
  GlobeIcon,
  LogInIcon,
  MoonIcon,
  PauseIcon,
  SettingsIcon,
  SliderIcon,
  SunIcon,
  ZapIcon,
  getFlagEmoji,
} from '../../../components/icons/SettingsIcons';

describe('SettingsIcons', () => {
  it('renders all icon variants with the provided props', () => {
    expect(SettingsIcon({ size: 18, color: '#123456', strokeWidth: 3 })).toMatchObject({
      props: { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(MoonIcon({ size: 19, color: '#abcdef', strokeWidth: 2 })).toMatchObject({
      props: { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(SunIcon({ size: 20, color: '#fedcba', strokeWidth: 1.5 })).toMatchObject({
      props: { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(AutoIcon({ size: 21, color: '#111111', strokeWidth: 2 })).toMatchObject({
      props: { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(ArrowUpIcon({ size: 22, color: '#222222', strokeWidth: 2 })).toMatchObject({
      props: { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(LogInIcon({ size: 23, color: '#333333', strokeWidth: 2 })).toMatchObject({
      props: { width: 23, height: 23, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(ZapIcon({ size: 24, color: '#444444', strokeWidth: 2 })).toMatchObject({
      props: { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(SliderIcon({ size: 25, color: '#555555', strokeWidth: 2 })).toMatchObject({
      props: { width: 25, height: 25, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(PauseIcon({ size: 26, color: '#666666', strokeWidth: 2 })).toMatchObject({
      props: { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(GlobeIcon({ size: 27, color: '#777777', strokeWidth: 2 })).toMatchObject({
      props: { width: 27, height: 27, viewBox: '0 0 24 24', fill: 'none' },
    });
    expect(CheckIcon({ size: 28, color: '#888888', strokeWidth: 2.5 })).toMatchObject({
      props: { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none' },
    });
  });

  it('maps locale codes to flags and falls back when unknown', () => {
    expect(getFlagEmoji('en')).toBe('🇺🇸');
    expect(getFlagEmoji('PT')).toBe('🇧🇷');
    expect(getFlagEmoji('zz')).toBe('🏳️');
  });
});
