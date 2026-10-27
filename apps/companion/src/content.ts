import type { CapabilityRow, StageInfo } from './types';

export const stages: StageInfo[] = [
  {
    key: 'hatchling',
    name: 'Hatchling',
    trigger: 'Opens the Companion',
    note: 'Everyone starts here. A small, curious blob with a lot to learn.',
    say: 'Hi! I just hatched.',
  },
  {
    key: 'curious',
    name: 'Curious',
    trigger: 'Gets a first real answer',
    note: 'Grows once a question about the programme is answered from the event catalog.',
    say: 'What do you want to know?',
  },
  {
    key: 'helpful',
    name: 'Helpful',
    trigger: 'Completes a real action',
    note: 'Grows after a calendar draft is downloaded or an event is saved to your agenda.',
    say: 'Want me to plan your day?',
  },
];

/** Provisional until the guest quota service (#469) is built; the page labels it as a proposal. */
export const proposedGuestTurns = 5;

export const capabilities: CapabilityRow[] = [
  { label: 'Pixel pet and basic conversation', guest: 'Included', member: 'Included' },
  { label: 'Public event recommendations', guest: 'Included', member: 'Included' },
  { label: 'Download a calendar draft (.ics)', guest: 'Included', member: 'Included' },
  { label: 'Personal agenda and event history', guest: 'Not included', member: 'Included' },
  { label: 'Original private ticket', guest: 'Not included', member: 'Included' },
  { label: 'Save an event to your HASHPASS agenda', guest: 'Not included', member: 'Included' },
  { label: 'Networking and meeting requests', guest: 'Not included', member: 'Planned, later' },
];

export const houseRules = [
  {
    title: 'Growth is earned',
    body: 'Your pet evolves from things you actually finish, never from how many messages you send.',
  },
  {
    title: 'Start without an account',
    body: 'Ask about the programme or sketch a calendar draft first. Sign in only when you want to keep something.',
  },
  {
    title: 'Limits you can see',
    body: 'Guests get a small allowance of AI turns, counted on the server and always visible, so it never ends by surprise.',
  },
  {
    title: 'Your identity stays yours',
    body: 'HASHPASS ID owns sign-in whichever model answers. No model keys ever reach your browser.',
  },
];
