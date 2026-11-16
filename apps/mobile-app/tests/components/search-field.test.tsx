import React from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SearchField } from '@hashpass/ui/primitives';

describe('SearchField leading action', () => {
  it('keeps direct typing inline while the magnifier action opens suggestions', () => {
    const onLeadingIconPress = jest.fn();
    const onChangeText = jest.fn();
    let view!: ReactTestRenderer;
    act(() => {
      view = create(
        <SearchField
          mode="light"
          leadingIcon={<Text>⌕</Text>}
          onLeadingIconPress={onLeadingIconPress}
          leadingIconAccessibilityLabel="Open search suggestions"
          value=""
          onChangeText={onChangeText}
          placeholder="Search events"
        />,
      );
    });

    const input = view.root.findByType(TextInput);
    act(() => input.props.onChangeText('Bogotá'));

    expect(onChangeText).toHaveBeenCalledWith('Bogotá');
    expect(onLeadingIconPress).not.toHaveBeenCalled();

    const magnifierAction = view.root.findByType(Pressable);
    act(() => magnifierAction.props.onPress());

    expect(onLeadingIconPress).toHaveBeenCalledTimes(1);
    expect(magnifierAction.props.accessibilityLabel).toBe('Open search suggestions');
  });
});
