import type { en } from './i18n/en.ts';
import type { InboxBellProps } from './confirm/types';
import type { CompanionAuthState } from './auth/types';
import type { AccountMenuProps } from './account/types';
import type { AnimationLevel, AppSettings, LocaleCode, ThemeMode } from '@hashpass/ui/settings';
import type { icons } from './icons';
import type { sprites } from './sprites';

export type SpriteKey = keyof typeof sprites;
export type IconKey = keyof typeof icons;
export type StageKey = 'hatchling' | 'curious' | 'helpful';
export type PetMood = 'idle' | 'hi' | 'think' | 'cheer';

export type CapabilityValue = 'yes' | 'no' | 'later';
export type CapabilityRow = { key: string; guest: CapabilityValue; member: CapabilityValue };

export type DemoAction = { id: 'ask' | 'ics' | 'chat'; unlocks: StageKey | null; mood: PetMood };

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

export type Choice = { correct: boolean };
/** Text for step i, answer j and its reply is in the catalog: level.<id>.s<i>, .s<i>.c<j>, .s<i>.r<j>. */
export type Step = { choices?: Choice[] };
export type NpcLook = 'guide' | 'speaker' | 'calendar' | 'mate';

export type LevelDef = {
  id: string;
  needTokens: number;
  /** Which token art to draw; never shown to the player. */
  tokenLabel: string;
  skyTop: string;
  skyBottom: string;
  hill: string;
  grass: string;
  dirt: string;
  stars: boolean;
  npcLook: NpcLook;
  npcSteps: Step[];
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
  /** Index of the answer last picked on this step, or null. The reply text comes from the catalog. */
  picked: number | null;
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

export type HouseRule = { icon: IconKey; id: string };

/* i18n, settings, voice and the intro film */
export type MessageKey = keyof typeof en;
export type TranslateVars = Record<string, string | number>;
/** Looks up a catalog entry and fills `{name}` placeholders. Falls back to English, then to the key itself. */
export type Translate = (key: string, vars?: TranslateVars) => string;

export type SettingsContextValue = {
  settings: AppSettings;
  /** True when the resolved colour scheme is dark (explicit choice, or the OS preference when set to auto). */
  isDark: boolean;
  t: Translate;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: LocaleCode) => void;
  setAnimation: (animation: AnimationLevel) => void;
  setVoice: (voice: boolean) => void;
};

/** `ok` can speak; `unsupported` has no speech engine; `novoice` has an engine but no voice for the language. */
export type VoiceStatus = 'ok' | 'unsupported' | 'novoice';
export type SpeakOptions = { lang: string; onEnd?: () => void };

export type FilmScene = {
  id: string;
  /** Catalog keys are film.<id>.title and film.<id>.line. */
  sprite: StageKey;
  icon: IconKey;
};

export type HeroProps = {
  hasArchive: boolean;
  onSetup: () => void;
  /** Both are null until someone is connected with a HASHPASS ID or a setup email. */
  inbox: InboxBellProps | null;
  account: AccountMenuProps | null;
};

export type GuestStartProps = {
  auth: CompanionAuthState;
  hasArchive: boolean;
  onSignIn: () => Promise<void>;
  onEmail: () => void;
};
