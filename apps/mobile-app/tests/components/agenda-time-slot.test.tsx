/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import AgendaTimeSlot from '../../components/AgendaTimeSlot';

const mount = async (props: Partial<React.ComponentProps<typeof AgendaTimeSlot>>) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <AgendaTimeSlot color="#2563EB" startLabel="8:00 AM" endLabel="9:00 AM" {...props}>
        <Text>card</Text>
      </AgendaTimeSlot>,
    );
  });
  return renderer;
};
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => n.children.join(''));
const lines = (r: ReturnType<typeof create>) => r.root.findAllByProps({ testID: 'agenda-now-line' });

describe('AgendaTimeSlot', () => {
  it('shows the start and end time in the rail beside the card', async () => {
    const r = await mount({ isDark: true });
    expect(texts(r)).toEqual(expect.arrayContaining(['8:00 AM', '9:00 AM', 'card']));
    expect(lines(r)).toHaveLength(0);
  });

  it('leaves the rail empty for a session that starts with the previous one', async () => {
    const r = await mount({ startLabel: undefined, endLabel: undefined });
    expect(texts(r)).toEqual(['card']);
  });

  it('draws the red current-time line above, across or below the card', async () => {
    for (const nowLine of [
      { mode: 'before' as const, label: '7:55 AM' },
      { mode: 'within' as const, fraction: 0.4, label: '8:25 AM' },
      { mode: 'after' as const, label: '6:00 PM' },
    ]) {
      const r = await mount({ nowLine });
      expect(lines(r).length).toBeGreaterThan(0);
      expect(texts(r)).toContain(nowLine.label);
      act(() => r.unmount());
    }
  });
});
