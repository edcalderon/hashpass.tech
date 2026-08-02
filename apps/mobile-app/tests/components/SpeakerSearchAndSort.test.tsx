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
  it('initially returns only speakers with claimed, active profiles', async () => {
    const onFilteredSpeakers = jest.fn();
    const onGroupedSpeakers = jest.fn();
    const speakers = [
      { id: 'active', name: 'Active Speaker', title: null, company: null, isActive: true },
      { id: 'unclaimed', name: 'Unclaimed Speaker', title: null, company: null, isActive: false },
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
        />,
      );
    });

    expect(onFilteredSpeakers).toHaveBeenLastCalledWith([speakers[0]]);
    await act(async () => renderer!.unmount());
  });
});
