import React from 'react';
import { MaterialIcons } from '../../lib/vector-icons';
import StatusPill from '../../components/StatusPill';

jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

const { act, create } = require('react-test-renderer');

describe('StatusPill', () => {
  it('renders a static pill with the label, trailing icon and a single testID match', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <StatusPill label="Keynote" color="#af0d01" trailingIcon={<MaterialIcons name="check" />} pillTestID="pill" />,
      );
    });
    expect(renderer!.root.findAllByProps({ children: 'Keynote' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'pill' })).toHaveLength(1);
    expect(renderer!.root.findAllByProps({ name: 'check' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findByProps({ testID: 'pill' }).props.onPress).toBeUndefined();
  });

  it('becomes pressable when onPress is provided, in dark mode', async () => {
    const onPress = jest.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <StatusPill label="Live" color="#22c55e" isDark onPress={onPress} accessibilityLabel="Live now" pillTestID="live" />,
      );
    });
    const pill = renderer!.root.findByProps({ testID: 'live' });
    await act(async () => {
      pill.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pill.props.accessibilityLabel).toBe('Live now');
  });
});
