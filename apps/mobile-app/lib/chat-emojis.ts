export type ChatEmojiCategoryId = 'reactions' | 'fun' | 'celebrate' | 'travel';

export interface ChatEmojiCategory {
  id: ChatEmojiCategoryId;
  label: string;
  icon: string;
  emojis: readonly string[];
}

/**
 * Product-curated, dependency-free emoji palette. Keeping this as Unicode
 * means emojis work identically in web and native clients and stay intact
 * through the UTF-8 encrypted chat payload.
 */
export const CHAT_EMOJI_CATEGORIES: readonly ChatEmojiCategory[] = [
  {
    id: 'reactions',
    label: 'Reactions',
    icon: '👍',
    emojis: ['👍', '👎', '❤️', '🔥', '👏', '🙌', '👀', '✅'],
  },
  {
    id: 'fun',
    label: 'Funny',
    icon: '😂',
    emojis: ['😂', '🤣', '😎', '🤩', '🤠', '🥳', '🤖', '💃'],
  },
  {
    id: 'celebrate',
    label: 'Celebrate',
    icon: '🎉',
    emojis: ['🎉', '🎊', '🏆', '✨', '💯', '🚀', '💥', '🌟'],
  },
  {
    id: 'travel',
    label: 'Event',
    icon: '🤝',
    emojis: ['🤝', '👋', '☕', '📍', '🎤', '📅', '💬', '🫶'],
  },
];

export const getChatEmojiCategory = (id: ChatEmojiCategoryId) =>
  CHAT_EMOJI_CATEGORIES.find((category) => category.id === id) || CHAT_EMOJI_CATEGORIES[0];
