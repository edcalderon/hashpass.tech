/// <reference types="jest" />

import { CHAT_EMOJI_CATEGORIES, getChatEmojiCategory } from '../../lib/chat-emojis';

describe('chat emoji palette', () => {
  it('ships a curated, categorized palette for reactions and fun messages', () => {
    expect(CHAT_EMOJI_CATEGORIES.map((category) => category.id)).toEqual([
      'reactions', 'fun', 'celebrate', 'travel',
    ]);
    expect(getChatEmojiCategory('fun').emojis).toContain('😂');
  });

  it('falls back to reactions if an obsolete category is requested', () => {
    expect(getChatEmojiCategory('unknown' as any).id).toBe('reactions');
  });
});
