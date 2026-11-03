/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';
import NotificationDateTimeField from '../../../components/admin/NotificationDateTimeField.web';

describe('NotificationDateTimeField.web', () => {
  it('uses the browser date and time picker and returns a local datetime value', () => {
    const onChangeText = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NotificationDateTimeField
          mode="light"
          label="Schedule send (optional)"
          value="2026-11-02T14:30"
          onChangeText={onChangeText}
          accessibilityHint="Choose a local date and time."
        />,
      );
    });
    const input = renderer.root.findByType('input');

    expect(input.props.type).toBe('datetime-local');
    expect(input.props.step).toBe(60);
    expect(input.props.value).toBe('2026-11-02T14:30');
    expect(input.props['aria-label']).toBe('Schedule send (optional)');
    act(() => input.props.onChange({ currentTarget: { value: '2026-11-02T15:45' } }));
    expect(onChangeText).toHaveBeenCalledWith('2026-11-02T15:45');
    act(() => renderer.unmount());
  });
});
