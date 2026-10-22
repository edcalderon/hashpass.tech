import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import ContactsExperience from '../../../mobile-app/components/contacts/ContactsExperience';
import type { ContactProfile, ContactsSnapshot } from '../../../mobile-app/types/contacts';

// Fictional fixtures belong only in the catalog; production reads the Contacts API.
const people: ContactProfile[] = [
  ['Ari Park', 'Product designer', 'Studio North', ['Design', 'AI']],
  ['Alex Rivera', 'Engineer', 'Open Collective', ['Web3', 'Infrastructure']],
  ['Robin Kim', 'Community lead', 'Builders Guild', ['Community', 'Gaming']],
  ['Sam Chen', 'Founder', 'New Orbit', ['Startups', 'Payments']],
  ['Dani Moreau', 'Researcher', 'Studio North', ['AI', 'Design']],
  ['Taylor Cruz', 'Developer', 'Open Collective', ['Web3', 'DeFi']],
].map(([name, role, company, topics], index) => ({ id: `fixture-${index}`, name: name as string, role: role as string, company: company as string, topics: topics as string[], connections: index + 1, points: (index + 1) * 100 + 40, discoverable: true, leaderboard: true }));
const snapshot: ContactsSnapshot = {
  profile: { ...people[0], id: 'me', name: 'Your profile', topics: ['Design', 'AI', 'Web3'], share_id: '00000000-0000-4000-8000-000000000001', points: 660, connections: 6 },
  contacts: people, incoming: [{ id: 'request', profile: { ...people[2], id: 'new' } }], outgoing: [], suggestions: [], shared: null,
  leaderboard: [...people].reverse(),
};
const meta = {
  title: 'Product/Contacts', component: ContactsExperience,
  parameters: { layout: 'fullscreen' },
  args: { snapshot, signedIn: true, standalone: true, mode: 'dark', onAction: async () => true, onRetry: () => {}, onSignIn: () => {}, onDashboard: () => {}, onStandalone: () => {} },
} satisfies Meta<typeof ContactsExperience>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { args: { mode: 'light' } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
export const Empty: Story = { args: { snapshot: { ...snapshot, contacts: [], incoming: [], leaderboard: [], profile: { ...snapshot.profile!, points: 60, connections: 0 } } } };
export const Guest: Story = { args: { signedIn: false, snapshot: null } };
export const Unavailable: Story = { args: { snapshot: null, error: 'unavailable' } };
