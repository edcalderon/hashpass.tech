/// <reference types="jest" />

const mockPlatform = { OS: 'web' };

jest.mock('react-native', () => ({ Platform: mockPlatform }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shouldSendMessageOnWebEnter } = require('../../lib/chat-input') as typeof import('../../lib/chat-input');

describe('shouldSendMessageOnWebEnter', () => {
  afterEach(() => {
    mockPlatform.OS = 'web';
  });

  it('submits on plain Enter in the web chat composer', () => {
    expect(shouldSendMessageOnWebEnter({ nativeEvent: { key: 'Enter' } })).toBe(true);
  });

  it('keeps Shift+Enter for a newline and does not interrupt IME composition', () => {
    expect(shouldSendMessageOnWebEnter({ nativeEvent: { key: 'Enter', shiftKey: true } })).toBe(false);
    expect(shouldSendMessageOnWebEnter({ nativeEvent: { key: 'Enter', isComposing: true } })).toBe(false);
  });

  it('also accepts the browser event shape forwarded by React Native Web', () => {
    expect(shouldSendMessageOnWebEnter({ key: 'Enter' })).toBe(true);
  });

  it('does not alter native keyboard behaviour', () => {
    mockPlatform.OS = 'ios';
    expect(shouldSendMessageOnWebEnter({ nativeEvent: { key: 'Enter' } })).toBe(false);
  });
});
