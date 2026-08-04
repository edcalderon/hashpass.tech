/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';

const { act, create } = require('react-test-renderer');

const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
let mockCanGoBack = true;
let mockLocale = 'en';

const mockColors = {
  primary: '#c81000',
  divider: '#dddddd',
  surface: '#f5f5f5',
  text: {
    primary: '#111111',
    secondary: '#555555',
  },
  background: { primary: '#ffffff' },
};

const chainableEntering = () => {
  const chain: any = { duration: () => chain, delay: () => chain };
  return chain;
};

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View },
    FadeIn: chainableEntering(),
    FadeInDown: chainableEntering(),
    FadeInUp: chainableEntering(),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
    replace: mockRouterReplace,
    canGoBack: () => mockCanGoBack,
  }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: mockColors, isDark: false }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => '' }),
  getCurrentLocale: () => mockLocale,
}));

jest.mock('../../lib/vector-icons', () => {
  const RN = require('react-native');
  return { MaterialIcons: (props: any) => <RN.Text>{props.name}</RN.Text> };
});

jest.mock('../../lib/hashpass-logo', () => ({
  getHashpassFullLogo: () => 'logo-source',
}));

jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white.svg', () => 'header-logo-source', {
  virtual: true,
});

jest.mock('../../components/QuickSettingsPanel', () => () => null);

jest.mock('../../components/DemoVideoPlayer', () => {
  const RN = require('react-native');
  const ReactActual = require('react');
  return {
    DemoVideoPlayer: ReactActual.forwardRef((props: any, ref: any) => (
      <RN.View testID="demo-video-player" {...props} ref={ref} />
    )),
  };
});

jest.mock('../../components/DemoCaptionBar', () => {
  const RN = require('react-native');
  return {
    DemoCaptionBar: (props: any) => (props.visible ? <RN.Text testID="demo-caption-bar">{props.text}</RN.Text> : null),
  };
});

import DemoPage, { getDemoCaptionCues } from '../../app/demo';
import { demoChaptersEn, demoChaptersEs, bslChapters, demoVideoSources, demoBslShowcase } from '../../lib/demo-chapters';
import { demoCaptionsEn, demoCaptionsEs } from '../../lib/demo-captions';

const loadDemoPage = () => {
  let renderer: any;
  act(() => {
    renderer = create(<DemoPage />);
  });
  return renderer;
};

describe('DemoPage', () => {
  beforeEach(() => {
    mockRouterBack.mockReset();
    mockRouterReplace.mockReset();
    mockCanGoBack = true;
    mockLocale = 'en';
  });

  it('renders the app-tutorial video with the EN narrated source by default', () => {
    const renderer = loadDemoPage();
    const player = renderer.root.findByProps({ testID: 'demo-video-player' });
    expect(player.props.src).toBe(demoVideoSources.en.narrated);
    expect(player.props.muted).toBe(false);
  });

  it('goes back when there is history to go back to', () => {
    const renderer = loadDemoPage();
    act(() => {
      renderer.root.findByProps({ testID: 'demo-back-button' }).props.onPress();
    });
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('falls back to replacing with the landing route when there is no history', () => {
    mockCanGoBack = false;
    const renderer = loadDemoPage();
    act(() => {
      renderer.root.findByProps({ testID: 'demo-back-button' }).props.onPress();
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('switches to the BSL tab and swaps the video source + chapters', () => {
    const renderer = loadDemoPage();
    act(() => {
      renderer.root.findByProps({ testID: 'demo-tab-bsl' }).props.onPress();
    });
    const player = renderer.root.findByProps({ testID: 'demo-video-player' });
    expect(player.props.src).toBe(demoBslShowcase.en.narrated);
    expect(renderer.root.findByProps({ testID: `demo-chapter-${bslChapters[0].slug}` })).toBeTruthy();
  });

  it('toggles mute via the mute button', () => {
    const renderer = loadDemoPage();
    let player = renderer.root.findByProps({ testID: 'demo-video-player' });
    expect(player.props.muted).toBe(false);

    act(() => {
      renderer.root.findByProps({ testID: 'demo-mute-button' }).props.onPress();
    });
    player = renderer.root.findByProps({ testID: 'demo-video-player' });
    expect(player.props.muted).toBe(true);
  });

  it('toggles captions via the CC button, hiding the caption bar', () => {
    const renderer = loadDemoPage();
    expect(renderer.root.findAllByProps({ testID: 'demo-caption-bar' }).length).toBe(1);

    act(() => {
      renderer.root.findByProps({ testID: 'demo-cc-button' }).props.onPress();
    });
    expect(renderer.root.findAllByProps({ testID: 'demo-caption-bar' }).length).toBe(0);
  });

  it('seeks to a chapter and marks it active on press', () => {
    const renderer = loadDemoPage();
    const secondChapter = demoChaptersEn[1];

    act(() => {
      renderer.root.findByProps({ testID: `demo-chapter-${secondChapter.slug}` }).props.onPress();
    });

    const button = renderer.root.findByProps({ testID: `demo-chapter-${secondChapter.slug}` });
    expect(button.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: mockColors.primary })]),
    );
  });

  it('uses the ES narrated source and ES captions when locale is es', () => {
    mockLocale = 'es';
    const renderer = loadDemoPage();
    const player = renderer.root.findByProps({ testID: 'demo-video-player' });
    expect(player.props.src).toBe(demoVideoSources.es.narrated);
  });
});

describe('getDemoCaptionCues', () => {
  it('returns the real ES caption set when the audio locale is es', () => {
    expect(getDemoCaptionCues('es', 'es')).toBe(demoCaptionsEs);
  });

  it('returns the EN caption set as-is for the en UI locale', () => {
    expect(getDemoCaptionCues('en', 'en')).toBe(demoCaptionsEn);
  });

  it('falls back to EN captions for a UI locale with no translation available', () => {
    const cues = getDemoCaptionCues('xx', 'en');
    expect(cues).toEqual(demoCaptionsEn);
  });

  it('translates EN-timed captions into a supported non-EN/ES UI locale', () => {
    const cues = getDemoCaptionCues('fr', 'en');
    expect(cues).toHaveLength(demoCaptionsEn.length);
    expect(cues[0].start).toBe(demoCaptionsEn[0].start);
    expect(cues[0].text).not.toBe(demoCaptionsEn[0].text);
  });
});
