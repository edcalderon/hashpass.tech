/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';
import SpeakerSearchAndSort from '../../components/SpeakerSearchAndSort';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: { primary: '#111827', secondary: '#6b7280' },
      background: { paper: '#ffffff' },
      divider: '#e5e7eb',
    },
  }),
}));

jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

describe('SpeakerSearchAndSort', () => {
  it('honors event speaker order ahead of legacy BSL priorities', async () => {
    const onFilteredSpeakers = jest.fn();
    const speakers = [
      { id: 'edward', name: 'Edward Calderón', sortOrder: 30, isActive: true, title: null, company: null },
      { id: 'bryan', name: 'Bryan Aguilar', sortOrder: 20, isActive: true, title: null, company: null },
      { id: 'lucero', name: 'Lucero Dextre', sortOrder: 10, isActive: true, title: null, company: null },
    ];
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakerSearchAndSort speakers={speakers}
        onFilteredSpeakers={onFilteredSpeakers} onGroupedSpeakers={jest.fn()}
        onSearchChange={jest.fn()} onSortChange={jest.fn()} />);
    });
    expect(onFilteredSpeakers).toHaveBeenLastCalledWith([speakers[2], speakers[1], speakers[0]]);
    expect(speakers[0].id).toBe('edward');
    act(() => renderer!.unmount());
  });

  it('returns every speaker while keeping claimed, active profiles first', async () => {
    const onFilteredSpeakers = jest.fn();
    const onGroupedSpeakers = jest.fn();
    const onActiveFilterChange = jest.fn();
    const speakers = [
      { id: 'unclaimed', name: 'Unclaimed Speaker', title: null, company: null, isActive: false },
      { id: 'active', name: 'Active Speaker', title: null, company: null, isActive: true },
    ];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <SpeakerSearchAndSort
          speakers={speakers}
          onFilteredSpeakers={onFilteredSpeakers}
          onGroupedSpeakers={onGroupedSpeakers}
          onSearchChange={jest.fn()}
          onSortChange={jest.fn()}
          onActiveFilterChange={onActiveFilterChange}
        />,
      );
    });

    expect(onFilteredSpeakers).toHaveBeenLastCalledWith([speakers[1], speakers[0]]);

    await act(async () => {
      renderer!.root.findByProps({ testID: 'speaker-sort-filter-button' }).props.onPress();
    });
    expect(renderer!.root.findByProps({ testID: 'show-active-speakers-toggle' })).toBeTruthy();

    await act(async () => {
      renderer!.root.findByProps({ testID: 'show-active-speakers-toggle' }).props.onPress();
    });
    expect(onActiveFilterChange).toHaveBeenLastCalledWith(true);
    expect(onFilteredSpeakers).toHaveBeenLastCalledWith([speakers[1]]);
    await act(async () => renderer!.unmount());
  });
});
