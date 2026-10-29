/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';
import UnifiedSearchAndFilter from '../../components/UnifiedSearchAndFilter';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#E5413A',
      primaryContrastText: '#ffffff',
      text: { primary: '#111827', secondary: '#6b7280' },
      background: { paper: '#ffffff', default: '#ffffff' },
      divider: '#e5e7eb',
    },
  }),
}));

jest.mock('../../lib/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
  NativeSafeIcon: 'NativeSafeIcon',
}));

const groups = [{
  key: 'type',
  label: 'Type',
  type: 'single' as const,
  options: [{ key: 'workshop', label: 'Workshop', icon: 'build', color: '#7C5CFF' }],
}];

const flat = (style: unknown): Record<string, any> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('UnifiedSearchAndFilter', () => {
  const render = async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <UnifiedSearchAndFilter data={[]} onFilteredData={jest.fn()} onSearchChange={jest.fn()} filterGroups={groups} />,
      );
    });
    return renderer!;
  };
  const openButton = (r: ReturnType<typeof create>) => r.root.findByProps({ accessibilityLabel: 'Open filters' });

  it('closes the filter card when the user taps outside it', async () => {
    const renderer = await render();
    expect(renderer.root.findAllByProps({ testID: 'filters-backdrop' })).toHaveLength(0);

    act(() => openButton(renderer).props.onPress());
    const backdrop = renderer.root.findAllByProps({ testID: 'filters-backdrop' })
      .find((node) => typeof node.props.onPress === 'function')!;
    expect(backdrop).toBeTruthy();

    act(() => backdrop.props.onPress());
    expect(renderer.root.findAllByProps({ testID: 'filters-backdrop' })).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('styles each type option as a soft tinted pill that keeps its colour dot', async () => {
    const renderer = await render();
    act(() => openButton(renderer).props.onPress());
    const option = renderer.root.findAllByProps({ accessibilityRole: 'radio' })[0];
    const style = flat(option.props.style);
    expect(style.backgroundColor).toBe('#7C5CFF12');
    expect(style.borderColor).toBe('#7C5CFF4d');
    expect(renderer.root.findAll((n) => flat(n.props.style).backgroundColor === '#7C5CFF' && flat(n.props.style).width === 9)).not.toHaveLength(0);
    act(() => renderer.unmount());
  });
});
