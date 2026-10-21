import type { ContactProfile } from '../types/contacts';

export const CONTACT_TOPICS = ['AI', 'Web3', 'Design', 'Startups', 'Payments', 'DeFi', 'Infrastructure', 'Gaming', 'Policy', 'Community'] as const;
export const MAX_CONTACT_TOPICS = 5;
export const CONNECTION_XP = 100;
export const TOPIC_XP = 20;
export const LEVEL_XP = 500;

// Network XP is a non-monetary progression score, separate from wallet HashPoints.
export function networkProgress(points: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  return { level: Math.floor(safe / LEVEL_XP) + 1, current: safe % LEVEL_XP, remaining: LEVEL_XP - safe % LEVEL_XP, percent: safe % LEVEL_XP / LEVEL_XP * 100 };
}

export function filterContacts(contacts: ContactProfile[], query: string, topic: string | null) {
  const normalized = query.trim().toLocaleLowerCase();
  return contacts.filter(contact => (!topic || contact.topics.includes(topic)) &&
    (!normalized || [contact.name, contact.role, contact.company, ...contact.topics].join(' ').toLocaleLowerCase().includes(normalized)));
}

export function toggleContactTopic(topics: string[], topic: string) {
  if (topics.includes(topic)) return topics.filter(value => value !== topic);
  return topics.length < MAX_CONTACT_TOPICS ? [...topics, topic] : topics;
}

export function contactInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}
