/**
 * Game state for one level: pure functions over plain data, no DOM. The canvas renderer and the React dialog
 * only read this state, and the node tests drive it directly.
 */
import type { Body, Game, Input, LevelDef, Spot, TalkState, Token } from '../types.ts';
import { BODY_H, BODY_W, TILE, makeGrid, overlaps, spawn, stepBody } from './physics.ts';

/** Hitbox sizes shared by the engine, the renderer and the reachability test. */
export const NPC_ZONE = { padX: 20, up: 32, w: TILE + 40, h: 48 };
export const FLAG_ZONE = { w: 12, h: 64 };
const TOKEN_INSET = 3;

export function startBody(spot: Spot): Body {
  return spawn(spot.tx * TILE + (TILE - BODY_W) / 2, (spot.ty + 1) * TILE - BODY_H);
}

export function npcRect(npc: Spot) {
  return { x: npc.tx * TILE - NPC_ZONE.padX, y: npc.ty * TILE - NPC_ZONE.up, w: NPC_ZONE.w, h: NPC_ZONE.h };
}

export function flagRect(flag: Spot) {
  return { x: flag.tx * TILE + 2, y: (flag.ty - 3) * TILE, w: FLAG_ZONE.w, h: FLAG_ZONE.h };
}

export function tokenRect(t: Spot) {
  return { x: t.tx * TILE + TOKEN_INSET, y: t.ty * TILE + TOKEN_INSET, w: TILE - 2 * TOKEN_INSET, h: TILE - 2 * TOKEN_INSET };
}

export function createGame(level: LevelDef): Game {
  const tokens: Token[] = [];
  let start: Spot = { tx: 1, ty: 9 };
  let npc: Spot | null = null;
  let flag: Spot = { tx: 1, ty: 9 };
  level.map.forEach((row, ty) => {
    [...row].forEach((ch, tx) => {
      if (ch === 'P') start = { tx, ty };
      else if (ch === 'N') npc = { tx, ty };
      else if (ch === 'F') flag = { tx, ty };
      else if (ch === 'c') tokens.push({ tx, ty, got: false });
    });
  });
  // Marker characters are open air for physics.
  const clean = level.map.map((row) => row.replace(/[PNFc]/g, '.'));
  return {
    level,
    grid: makeGrid(clean),
    body: startBody(start),
    start,
    npc,
    flag,
    tokens,
    collected: 0,
    questDone: !npc,
    finished: false,
    nearNpc: false,
    falls: 0,
    ticks: 0,
  };
}

function hit(b: Body, r: { x: number; y: number; w: number; h: number }) {
  return overlaps(b, r.x, r.y, r.w, r.h);
}

export function tickGame(g: Game, input: Input): void {
  if (g.finished) return;
  g.ticks += 1;
  stepBody(g.grid, g.body, input);
  if (g.body.y > (g.grid.rows + 3) * TILE) {
    g.body = startBody(g.start);
    g.falls += 1;
    return;
  }
  for (const t of g.tokens) {
    if (!t.got && hit(g.body, tokenRect(t))) {
      t.got = true;
      g.collected += 1;
    }
  }
  g.nearNpc = g.npc ? hit(g.body, npcRect(g.npc)) : false;
  if (g.questDone && hit(g.body, flagRect(g.flag))) g.finished = true;
}

export function talkState(g: Game): TalkState {
  if (g.questDone) return 'done';
  return g.collected >= g.level.needTokens ? 'ready' : 'locked';
}

export function completeQuest(g: Game): void {
  g.questDone = true;
}
