/**
 * Tutorial levels for the Companion quest. Every level teaches one real Companion feature and ends at a flag
 * that stays locked until the level's quest is done. The game is a short showcase: nothing here is sent anywhere
 * and the quiz copy only states things the Companion page itself already promises.
 *
 * Map legend: '.' air, '#' solid, '=' one-way plank, 'c' token, 'P' start, 'N' quest giver, 'F' flag.
 * All words (titles, objectives, quiz questions, answers and replies) live in the i18n catalogs under
 * `level.<id>.*`; this file holds only structure: maps, colours and which answer is correct.
 * Files under src/game that the node tests import use explicit .ts specifiers (Node type stripping).
 */
import type { Brush, LevelDef, Step } from '../types.ts';

export const ROWS = 12;

/** A quiz step whose answers appear in catalog order; `true` marks the one correct answer. */
const pick = (...correct: boolean[]): Step => ({ choices: correct.map((c) => ({ correct: c })) });
const GROUND_ROW = 10;

function build(cols: number, draw: (b: Brush) => void): string[] {
  const grid = Array.from({ length: ROWS }, () => Array<string>(cols).fill('.'));
  draw({
    set: (x, y, ch) => {
      grid[y][x] = ch;
    },
    ground: (from, to) => {
      for (let x = from; x <= to; x += 1) for (let y = GROUND_ROW; y < ROWS; y += 1) grid[y][x] = '#';
    },
    plank: (from, to, y) => {
      for (let x = from; x <= to; x += 1) grid[y][x] = '=';
    },
    pillar: (x, height) => {
      for (let y = GROUND_ROW - height; y < GROUND_ROW; y += 1) grid[y][x] = '#';
    },
  });
  return grid.map((row) => row.join(''));
}

export const levels: LevelDef[] = [
  {
    id: 'wake-up',
    needTokens: 0,
    tokenLabel: 'bonus stars',
    skyTop: '#0b1230',
    skyBottom: '#3b2a86',
    hill: '#1a1f5c',
    grass: '#2fbf84',
    dirt: '#1d5a47',
    stars: true,
    npcLook: 'guide',
    rewardStage: null,
    npcSteps: [pick(true, false), pick(true, false, false)],
    map: build(46, (b) => {
      b.ground(0, 21);
      b.ground(24, 45);
      b.set(2, 9, 'P');
      b.set(11, 9, 'N');
      b.set(16, 8, 'c');
      b.set(17, 8, 'c');
      b.plank(27, 30, 8);
      b.set(28, 7, 'c');
      b.pillar(33, 1);
      b.pillar(34, 2);
      b.pillar(35, 2);
      b.pillar(36, 1);
      b.set(42, 9, 'F');
    }),
  },
  {
    id: 'programme',
    needTokens: 3,
    tokenLabel: 'session cards',
    skyTop: '#10264a',
    skyBottom: '#1d6e8c',
    hill: '#17406a',
    grass: '#7bd26a',
    dirt: '#27506a',
    stars: true,
    npcLook: 'speaker',
    rewardStage: 'curious',
    npcSteps: [pick(true, false), pick(true, false)],
    map: build(56, (b) => {
      b.ground(0, 15);
      b.ground(19, 33);
      b.ground(37, 55);
      b.set(2, 9, 'P');
      b.plank(6, 9, 8);
      b.set(7, 7, 'c');
      b.plank(22, 25, 8);
      b.set(23, 7, 'c');
      b.plank(40, 42, 8);
      b.plank(44, 47, 6);
      b.set(45, 5, 'c');
      b.set(49, 9, 'N');
      b.set(54, 9, 'F');
    }),
  },
  {
    id: 'plan-your-day',
    needTokens: 3,
    tokenLabel: 'time slots',
    skyTop: '#3a2a6e',
    skyBottom: '#f2a35f',
    hill: '#6b3f7a',
    grass: '#9bd75f',
    dirt: '#6b4a2f',
    stars: false,
    npcLook: 'calendar',
    rewardStage: 'helpful',
    npcSteps: [{}, pick(true, false)],
    map: build(56, (b) => {
      b.ground(0, 25);
      b.ground(29, 55);
      b.set(2, 9, 'P');
      b.set(8, 8, 'c');
      b.plank(18, 21, 8);
      b.set(19, 7, 'c');
      b.pillar(30, 1);
      b.pillar(31, 2);
      b.pillar(32, 3);
      b.pillar(33, 3);
      b.pillar(34, 2);
      b.set(32, 6, 'c');
      b.set(50, 9, 'N');
      b.set(54, 9, 'F');
    }),
  },
  {
    id: 'meet-someone',
    needTokens: 0,
    tokenLabel: 'bonus stars',
    skyTop: '#1b0f3a',
    skyBottom: '#c04a8f',
    hill: '#3b1d5e',
    grass: '#43d6a1',
    dirt: '#2a3a5c',
    stars: true,
    npcLook: 'mate',
    rewardStage: null,
    npcSteps: [pick(true, false), pick(true, false)],
    map: build(60, (b) => {
      b.ground(0, 19);
      b.ground(22, 39);
      b.ground(43, 59);
      b.set(2, 9, 'P');
      b.set(10, 8, 'c');
      b.set(26, 8, 'c');
      b.set(30, 9, 'N');
      b.pillar(48, 1);
      b.pillar(49, 2);
      b.pillar(50, 3);
      b.pillar(51, 3);
      b.pillar(52, 2);
      b.pillar(53, 1);
      b.set(50, 6, 'c');
      b.set(57, 9, 'F');
    }),
  },
];
