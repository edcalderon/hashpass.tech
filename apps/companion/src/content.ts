import type { CapabilityRow, HouseRule, StageKey } from './types';

/** Structure only. Every visible word is a catalog key in src/i18n/*.ts. */
export const stageKeys: StageKey[] = ['hatchling', 'curious', 'helpful'];

/** Provisional until the guest quota service (#469) is built; the page labels it as a proposal. */
export const proposedGuestTurns = 5;

export const capabilities: CapabilityRow[] = [
  { key: 'cap.r1', guest: 'yes', member: 'yes' },
  { key: 'cap.r2', guest: 'yes', member: 'yes' },
  { key: 'cap.r3', guest: 'yes', member: 'yes' },
  { key: 'cap.r4', guest: 'no', member: 'yes' },
  { key: 'cap.r5', guest: 'no', member: 'yes' },
  { key: 'cap.r6', guest: 'no', member: 'yes' },
  { key: 'cap.r7', guest: 'no', member: 'later' },
];

export const houseRules: HouseRule[] = [
  { icon: 'star', id: 'rule.1' },
  { icon: 'key', id: 'rule.2' },
  { icon: 'heart', id: 'rule.3' },
  { icon: 'shield', id: 'rule.4' },
];
