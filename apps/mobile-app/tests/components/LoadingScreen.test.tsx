import React from 'react';
import { act, create } from 'react-test-renderer';
import LoadingScreen from '../../components/LoadingScreen';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { default: '#ffffff' },
      primary: '#123456',
      text: { primary: '#111111', secondary: '#666666' },
    },
  }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { retryCount?: number }) =>
      key === 'loading.default'
        ? 'Loading...'
        : key === 'loading.retrying'
          ? `Retrying... (${values?.retryCount}/3)`
          : 'Taking longer than expected, please wait...',
  }),
}));

jest.mock('../../components/HashpassLoader', () => 'HashpassLoader');

describe('LoadingScreen', () => {
  it('uses the shared branded loader by default', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<LoadingScreen />);
    });

    const loader = renderer.root.findByType('HashpassLoader' as any);
    expect(loader.props).toMatchObject({ size: 64, contextColor: '#123456' });
    expect(renderer.root.findAllByType('Text' as any).map(node => node.children.join(''))).toContain('Loading...');
    act(() => renderer.unmount());
  });

  it('passes the page icon, color, retry copy, subtitle, and full-screen layout to the loader', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <LoadingScreen
          icon="event-note"
          iconColor="#c026d3"
          message="Loading the agenda"
          subtitle="Preparing the schedule"
          retryCount={2}
          fullScreen
        />,
      );
    });

    const loader = renderer.root.findByType('HashpassLoader' as any);
    expect(loader.props).toMatchObject({
      size: 48,
      contextIcon: 'event-note',
      contextColor: '#c026d3',
      color: '#c026d3',
    });
    expect(renderer.root.findAllByType('Text' as any).map(node => node.children.join(''))).toEqual(
      expect.arrayContaining(['Preparing the schedule', 'Retrying... (2/3)', 'Taking longer than expected, please wait...']),
    );
    const container = renderer.root.findAllByType('View' as any)[0];
    expect(container.props.style).toEqual(expect.objectContaining({ flex: 1, minHeight: '100%' }));
    act(() => renderer.unmount());
  });

  it('can hide the loader and uses the compact size when requested', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<LoadingScreen spinnerSize="small" showSpinner={false} message="Waiting" />);
    });
    expect(renderer.root.findAllByType('HashpassLoader' as any)).toHaveLength(0);
    expect(renderer.root.findAllByType('Text' as any).map(node => node.children.join(''))).toContain('Waiting');
    act(() => renderer.unmount());

    act(() => {
      renderer = create(<LoadingScreen spinnerSize="small" />);
    });
    expect(renderer.root.findByType('HashpassLoader' as any).props.size).toBe(32);
    act(() => renderer.unmount());
  });
});
