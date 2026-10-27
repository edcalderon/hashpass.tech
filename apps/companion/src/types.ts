import type { sprites } from './sprites';

export type SpriteKey = keyof typeof sprites;
export type StageKey = 'hatchling' | 'curious' | 'helpful';
export type PetMood = 'idle' | 'hi' | 'think' | 'cheer';

export type StageInfo = {
  key: StageKey;
  name: string;
  trigger: string;
  note: string;
  say: string;
};

export type CapabilityRow = {
  label: string;
  guest: string;
  member: string;
};

export type DemoAction = {
  id: string;
  label: string;
  unlocks: StageKey | null;
  mood: PetMood;
  reply: string;
};

export interface VersionInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  releaseType: 'stable' | 'beta' | 'rc' | 'alpha';
  environment: 'development' | 'staging' | 'production';
  features: string[];
  bugfixes: string[];
  breakingChanges: string[];
  notes: string;
}

export interface VersionHistory {
  [version: string]: VersionInfo;
}

export type VersionsJson = {
  currentVersion?: Partial<VersionInfo> & { version?: string };
  versions?: Array<Partial<VersionInfo> & { version?: string }>;
};

export type Choice = { label: string; correct: boolean; reply: string };
export type Step = { say: string; choices?: Choice[] };
export type NpcLook = 'guide' | 'speaker' | 'calendar' | 'mate';

export type LevelDef = {
  id: string;
  title: string;
  badge: string;
  teaches: string;
  objective: string;
  needTokens: number;
  tokenLabel: string;
  skyTop: string;
  skyBottom: string;
  hill: string;
  grass: string;
  dirt: string;
  stars: boolean;
  npcName: string;
  npcLook: NpcLook;
  npcSteps: Step[];
  npcLockedSay: string;
  npcDoneSay: string;
  rewardStage: StageKey | null;
  map: string[];
};

export type Brush = {
  set: (x: number, y: number, ch: string) => void;
  ground: (from: number, to: number) => void;
  plank: (from: number, to: number, y: number) => void;
  pillar: (x: number, height: number) => void;
};
