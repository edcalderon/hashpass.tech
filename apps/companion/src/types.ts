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

/* Quest game */
export type Phase = 'intro' | 'play' | 'talk' | 'cleared' | 'end';
export type TalkState = 'locked' | 'ready' | 'done';
export type Hud = { collected: number; need: number; near: boolean; state: TalkState; falls: number };
export type Rows = { rows: string[]; palette: Record<string, string> };

export type Dialog = {
  step: number;
  /** Reply to the last answer, or null before one is given. */
  feedback: string | null;
  right: boolean;
  done: boolean;
};

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: boolean;
  coyote: number;
  buffer: number;
  wasJump: boolean;
  facing: 1 | -1;
};
export type Input = { dir: -1 | 0 | 1; jump: boolean };
export type Grid = {
  cols: number;
  rows: number;
  /** '#' solid, '=' one-way plank, anything else is open. */
  at: (tx: number, ty: number) => string;
};

export type Token = { tx: number; ty: number; got: boolean };
export type Spot = { tx: number; ty: number };
export type Game = {
  level: LevelDef;
  grid: Grid;
  body: Body;
  start: Spot;
  npc: Spot | null;
  flag: Spot;
  tokens: Token[];
  collected: number;
  questDone: boolean;
  finished: boolean;
  nearNpc: boolean;
  falls: number;
  ticks: number;
};
