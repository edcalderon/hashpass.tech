/**
 * Fixed-step platformer physics. Pure and deterministic: the same inputs always give the same motion, so the
 * node tests can search the physics for a path to every token, quest giver and flag in every level.
 * Units are pixels per tick at 60 ticks per second; tiles are 16 px.
 */
import type { Body, Grid, Input } from '../types.ts';

export const TILE = 16;
export const BODY_W = 10;
export const BODY_H = 14;

const GRAVITY = 0.42;
const MAX_FALL = 8;
const SPEED = 1.6;
const JUMP_SPEED = 7.2;
const JUMP_CUT = 2.4;
const COYOTE_TICKS = 6;
const BUFFER_TICKS = 6;

export function makeGrid(map: string[]): Grid {
  return {
    cols: map[0].length,
    rows: map.length,
    at: (tx, ty) => (ty < 0 ? '.' : tx < 0 || tx >= map[0].length ? '#' : ty >= map.length ? '.' : map[ty][tx]),
  };
}

export function spawn(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, ground: false, coyote: 0, buffer: 0, wasJump: false, facing: 1 };
}

const EPS = 0.001;

/** Advances the body one tick. Mutates and returns it. */
export function stepBody(grid: Grid, b: Body, input: Input): Body {
  const pressed = input.jump && !b.wasJump;
  b.wasJump = input.jump;
  b.buffer = pressed ? BUFFER_TICKS : Math.max(0, b.buffer - 1);
  b.coyote = b.ground ? COYOTE_TICKS : Math.max(0, b.coyote - 1);
  if (input.dir !== 0) b.facing = input.dir;

  if (b.buffer > 0 && b.coyote > 0) {
    b.vy = -JUMP_SPEED;
    b.buffer = 0;
    b.coyote = 0;
    b.ground = false;
  }
  if (!input.jump && b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;

  b.vx = input.dir * SPEED;
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY);

  // Horizontal: only solid tiles block sideways movement.
  b.x += b.vx;
  const top = Math.floor(b.y / TILE);
  const bottom = Math.floor((b.y + BODY_H - EPS) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + BODY_W - EPS) / TILE);
    for (let ty = top; ty <= bottom; ty += 1) {
      if (grid.at(tx, ty) === '#') {
        b.x = tx * TILE - BODY_W;
        break;
      }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = top; ty <= bottom; ty += 1) {
      if (grid.at(tx, ty) === '#') {
        b.x = (tx + 1) * TILE;
        break;
      }
    }
  }
  b.x = Math.max(0, Math.min(grid.cols * TILE - BODY_W, b.x));

  // Vertical: planks only catch a body that was above them and is falling.
  const prevBottom = b.y + BODY_H;
  b.y += b.vy;
  const left = Math.floor(b.x / TILE);
  const right = Math.floor((b.x + BODY_W - EPS) / TILE);
  b.ground = false;
  if (b.vy > 0) {
    const ty = Math.floor((b.y + BODY_H - EPS) / TILE);
    for (let tx = left; tx <= right; tx += 1) {
      const t = grid.at(tx, ty);
      if (t === '#' || (t === '=' && prevBottom <= ty * TILE + EPS)) {
        b.y = ty * TILE - BODY_H;
        b.vy = 0;
        b.ground = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = left; tx <= right; tx += 1) {
      if (grid.at(tx, ty) === '#') {
        b.y = (ty + 1) * TILE;
        b.vy = 0;
        break;
      }
    }
  }
  return b;
}

export function overlaps(b: Body, x: number, y: number, w: number, h: number): boolean {
  return b.x < x + w && b.x + BODY_W > x && b.y < y + h && b.y + BODY_H > y;
}
