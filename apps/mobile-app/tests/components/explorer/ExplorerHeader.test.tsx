/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import ExplorerHeader from '../../../components/explorer/ExplorerHeader';

const mockResolveEventImageSource = jest.fn();

jest.mock('react-native-svg', () => ({
  SvgUri: 'SvgUri',
}));

jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: '#111827',
        secondary: '#4b5563',
      },
    },
  }),
}));

jest.mock('../../../lib/event-branding', () => ({
  resolveEventImageSource: (image: string) => mockResolveEventImageSource(image),
}));

jest.mock('../../../assets/logos/bsl/bsl-colombia-pro.webp', () => 'default-bsl-logo');

describe('ExplorerHeader logo routing', () => {
  beforeEach(() => {
    mockResolveEventImageSource.mockReset();
  });

  it('renders the resolved bundled asset when the event branding resolver recognizes the logo', () => {
    mockResolveEventImageSource.mockReturnValue('resolved-bsl-logo');

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerHeader
          title="Explore"
          subtitle="Blockchain Summit"
          date="2026"
          logoUri="/logos/bsl/bsl-colombia-pro.svg"
          showEventSelector
        >
          <Text>Event selector</Text>
        </ExplorerHeader>,
      );
    });

    expect(renderer!.root.findByType('Image' as any).props.source).toBe('resolved-bsl-logo');
    expect(renderer!.root.findAllByType('SvgUri' as any)).toHaveLength(0);
    expect(renderer!.root.findByProps({ children: 'Event selector' })).toBeTruthy();
  });

  it('keeps unknown remote logo URLs on the SVG path', () => {
    mockResolveEventImageSource.mockReturnValue(undefined);

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerHeader
          title="Explore"
          subtitle="Blockchain Summit"
          logoUri="https://cdn.example.test/custom-logo.svg"
        />,
      );
    });

    expect(renderer!.root.findByType('SvgUri' as any).props).toEqual(expect.objectContaining({
      uri: 'https://cdn.example.test/custom-logo.svg',
      width: 40,
      height: 40,
    }));
    expect(renderer!.root.findAllByType('Image' as any)).toHaveLength(0);
  });

  it('uses the bundled Colombia logo when no logo URL is supplied', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerHeader title="Explore" subtitle="Blockchain Summit" />,
      );
    });

    expect(renderer!.root.findByType('Image' as any).props.source).toBe('default-bsl-logo');
    expect(mockResolveEventImageSource).not.toHaveBeenCalled();
  });
});
