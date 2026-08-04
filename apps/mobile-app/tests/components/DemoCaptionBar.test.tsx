/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';

const { act, create } = require('react-test-renderer');

const chainableEntering = () => {
  const chain: any = { duration: () => chain, delay: () => chain };
  return chain;
};

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { Text: RN.Text },
    FadeIn: chainableEntering(),
    FadeOut: chainableEntering(),
  };
});

import { DemoCaptionBar } from '../../components/DemoCaptionBar';

const colors = {
  surface: '#f5f5f5',
  divider: '#dddddd',
  background: { paper: '#ffffff' },
  text: { primary: '#111111', disabled: '#999999' },
} as any;

describe('DemoCaptionBar', () => {
  it('renders nothing when not visible', () => {
    let renderer: any;
    act(() => {
      renderer = create(<DemoCaptionBar text="hello" visible={false} colors={colors} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('renders the caption text when visible with text', () => {
    let renderer: any;
    act(() => {
      renderer = create(<DemoCaptionBar text="Welcome to Hash Pass" visible colors={colors} />);
    });
    expect(renderer.root.findByProps({ children: 'Welcome to Hash Pass' })).toBeTruthy();
  });

  it('renders an empty placeholder when visible with no current text', () => {
    let renderer: any;
    act(() => {
      renderer = create(<DemoCaptionBar text={null} visible colors={colors} />);
    });
    const texts = renderer.root.findAllByType('Text');
    // The placeholder renders a non-breaking space (U+00A0), not a plain
    // ASCII space, to keep the caption bar's height stable when empty.
    expect(texts.some((node: any) => node.props.children === ' ')).toBe(true);
  });
});
