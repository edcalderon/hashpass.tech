/// <reference types="jest" />

import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { FormField } from '@hashpass/ui/primitives';
import NotificationDateTimeField from '../../../components/admin/NotificationDateTimeField.web';

describe('NotificationDateTimeField.web', () => {
  it('uses the browser date and time picker and returns a local datetime value', () => {
    const onChangeText = jest.fn();
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    let renderer!: ReturnType<typeof create>;
    try {
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
      expect(input.props['aria-labelledby']).toBeTruthy();
      expect(input.props['aria-describedby']).toBeTruthy();
      act(() => input.props.onChange({ currentTarget: { value: '2026-11-02T15:45' } }));
      expect(onChangeText).toHaveBeenCalledWith('2026-11-02T15:45');
      act(() => renderer.unmount());
    } finally {
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    }
  });

  it('shares web validation, accessibility descriptions, and input callbacks', () => {
    const onChangeText = jest.fn();
    const onChange = jest.fn();
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    let renderer!: ReturnType<typeof create>;
    const changeEvent = { currentTarget: { value: '2026-11-02T16:00' } };
    const focusEvent = {};
    const blurEvent = {};
    try {
      act(() => {
        renderer = create(
          <FormField
            mode="dark"
            label="Schedule send"
            accessibilityLabel="Notification schedule"
            accessibilityHint="Choose a local date and time."
            value="2026-11-02T14:30"
            error="Choose a future date."
            editable={false}
            webInputType="datetime-local"
            webInputStep={60}
            onChangeText={onChangeText}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
          />,
        );
      });
      const input = renderer.root.findByType('input');
      const descriptionIds = input.props['aria-describedby'].split(' ');

      expect(input.props['aria-label']).toBe('Notification schedule');
      expect(input.props['aria-invalid']).toBe(true);
      expect(input.props.disabled).toBe(true);
      expect(descriptionIds).toHaveLength(2);
      expect(renderer.root.findAllByType('input')).toHaveLength(1);
      expect(renderer.root.findAll((node) => descriptionIds.includes(node.props.nativeID))).toHaveLength(2);

      act(() => input.props.onChange(changeEvent));
      act(() => input.props.onFocus(focusEvent));
      act(() => input.props.onBlur(blurEvent));
      expect(onChangeText).toHaveBeenCalledWith('2026-11-02T16:00');
      expect(onChange).toHaveBeenCalledWith(changeEvent);
      expect(onFocus).toHaveBeenCalledWith(focusEvent);
      expect(onBlur).toHaveBeenCalledWith(blurEvent);
      act(() => renderer.unmount());
    } finally {
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    }
  });

  it('keeps the native shared text field when browser input is requested off web', () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let renderer!: ReturnType<typeof create>;
    try {
      act(() => {
        renderer = create(
          <FormField
            mode="light"
            label="Schedule send"
            value="2026-11-02T14:30"
            webInputType="datetime-local"
          />,
        );
      });
      const input = renderer.root.findByType(TextInput);

      expect(input.props.accessibilityLabel).toBe('Schedule send');
      expect(renderer.root.findAllByType('input')).toHaveLength(0);
      act(() => renderer.unmount());
    } finally {
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    }
  });
});
