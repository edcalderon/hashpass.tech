import { filterContacts, networkProgress, toggleContactTopic } from '../../lib/contacts';
import type { ContactProfile } from '../../types/contacts';

const person: ContactProfile = { id: 'one', name: 'Ari Park', role: 'Designer', company: 'Studio', topics: ['AI', 'Design'], discoverable: true, leaderboard: false, points: 40, connections: 0 };

describe('contact discovery and network progression', () => {
  it('searches names, companies, roles and topics while honoring the topic filter', () => {
    for (const query of ['ARI', 'studio', 'designer', 'AI']) expect(filterContacts([person], query, 'Design')).toEqual([person]);
    expect(filterContacts([person], 'ari', 'Gaming')).toEqual([]);
    expect(filterContacts([person], 'unknown', null)).toEqual([]);
  });
  it('caps topic selection without preventing deselection', () => {
    const topics = ['AI', 'Web3', 'Design', 'Startups', 'Payments'];
    expect(toggleContactTopic(topics, 'Gaming')).toEqual(topics);
    expect(toggleContactTopic(topics, 'AI')).toEqual(topics.slice(1));
    expect(toggleContactTopic([], 'AI')).toEqual(['AI']);
  });
  it('advances levels at exactly 500 XP and never displays invalid progress', () => {
    expect(networkProgress(499)).toMatchObject({ level: 1, remaining: 1 });
    expect(networkProgress(500)).toMatchObject({ level: 2, current: 0, remaining: 500 });
    expect(networkProgress(1240)).toMatchObject({ level: 3, current: 240, percent: 48 });
    expect(networkProgress(-10).level).toBe(1);
    expect(networkProgress(NaN).current).toBe(0);
  });
});
