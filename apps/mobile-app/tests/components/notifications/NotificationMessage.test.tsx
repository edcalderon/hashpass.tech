/// <reference types="jest" />

import React from 'react';
import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import NotificationMessage, {
  openNotificationExternalUrl,
  splitNotificationLinks,
} from '../../../components/notifications/NotificationMessage';

describe('NotificationMessage', () => {
  it('links valid HTTP URLs while preserving surrounding text and punctuation', () => {
    expect(splitNotificationLinks('See https://example.com/deal. Then visit https://hashpass.app/info!')).toEqual([
      { text: 'See ' },
      { text: 'https://example.com/deal', url: 'https://example.com/deal' },
      { text: '. Then visit ' },
      { text: 'https://hashpass.app/info', url: 'https://hashpass.app/info' },
      { text: '!' },
    ]);
  });

  it('leaves empty and credential-bearing URLs as plain text', () => {
    expect(splitNotificationLinks('')).toEqual([{ text: '' }]);
    expect(splitNotificationLinks('https://user:secret@example.com')).toEqual([
      { text: 'https://user:secret@example.com' },
    ]);
  });

  it('preserves balanced parentheses in URL paths and trims unmatched closing punctuation', () => {
    expect(splitNotificationLinks('Read https://en.wikipedia.org/wiki/Proof_(mathematics).')).toEqual([
      { text: 'Read ' },
      { text: 'https://en.wikipedia.org/wiki/Proof_(mathematics)', url: 'https://en.wikipedia.org/wiki/Proof_(mathematics)' },
      { text: '.' },
    ]);
    expect(splitNotificationLinks('Visit https://example.com/path).')).toEqual([
      { text: 'Visit ' },
      { text: 'https://example.com/path', url: 'https://example.com/path' },
      { text: ').' },
    ]);
  });

  it('opens a web link in a separate tab with opener access disabled', () => {
    const open = jest.fn();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { open },
    });
    try {
      openNotificationExternalUrl('https://example.com', 'web');
      expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  });

  it('opens native links with the platform API', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    openNotificationExternalUrl('https://example.com/event', 'ios');
    expect(openUrl).toHaveBeenCalledWith('https://example.com/event');
    openUrl.mockRestore();
  });

  it('notifies the inbox after a link is tapped', () => {
    const onLinkOpen = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NotificationMessage
          message="Get details at https://example.com/event."
          style={undefined}
          accentColor="#b00"
          onLinkOpen={onLinkOpen}
        />,
      );
    });
    const link = renderer.root.find((node) => node.props.accessibilityRole === 'link');
    const stopPropagation = jest.fn();
    act(() => link.props.onPress({ stopPropagation }));

    expect(stopPropagation).toHaveBeenCalled();
    expect(onLinkOpen).toHaveBeenCalledWith('https://example.com/event');
    act(() => renderer.unmount());
  });
});
