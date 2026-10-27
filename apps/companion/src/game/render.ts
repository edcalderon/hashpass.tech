/** Canvas renderer. Reads game state, never changes it. Everything is drawn from rects, so it stays crisp pixel art. */
import { sprites } from '../sprites';
import type { Game, Rows, StageKey } from '../types';
import { talkState } from './engine';
import { BODY_H, TILE } from './physics';

export const VIEW_W = 320;
export const VIEW_H = 192;

const cache = new Map<string, HTMLCanvasElement>();

function sheet(key: string, art: Rows): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = art.rows[0].length;
  c.height = art.rows.length;
  const ctx = c.getContext('2d');
  if (ctx) {
    art.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = art.palette[ch];
        if (ch !== '.' && color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      });
    });
  }
  cache.set(key, c);
  return c;
}

const petSheet = (stage: StageKey) => sheet(`pet-${stage}`, sprites[stage] as unknown as Rows);
const guideSheet = () => sheet('guide', { ...(sprites.curious as unknown as Rows), palette: { ...(sprites.curious.palette as Record<string, string>), a: '#7be0a2', b: '#3fae78', c: '#e6fff0', o: '#103a24', p: '#103a24' } });
const mateSheet = () => sheet('mate', { ...(sprites.hatchling as unknown as Rows), palette: { ...(sprites.hatchling.palette as Record<string, string>), a: '#ff9ccb', b: '#e0679f', c: '#fff0f7', o: '#4a1230', p: '#4a1230' } });

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function drawSky(ctx: CanvasRenderingContext2D, g: Game, cam: number, time: number) {
  const { level } = g;
  const bands = 12;
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    const mix = (a: string, b: string) => {
      const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
      const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
      return `rgb(${pa.map((v, k) => Math.round(v + (pb[k] - v) * t)).join(',')})`;
    };
    rect(ctx, mix(level.skyTop, level.skyBottom), 0, (i * VIEW_H) / bands, VIEW_W, Math.ceil(VIEW_H / bands) + 1);
  }
  if (level.stars) {
    for (let i = 0; i < 40; i += 1) {
      const x = ((hash(i + 1) * (g.grid.cols * TILE) * 0.9 - cam * 0.12) % VIEW_W + VIEW_W) % VIEW_W;
      const y = hash(i + 101) * 100;
      const on = (Math.floor(time / 500) + i) % 5 !== 0;
      if (on) rect(ctx, '#e9fdff', x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
  }
  // Two stepped hill layers with parallax.
  for (const [speed, base, amp, color] of [
    [0.25, 138, 20, level.hill],
    [0.5, 156, 14, level.hill],
  ] as const) {
    ctx.fillStyle = color;
    ctx.globalAlpha = speed === 0.25 ? 0.7 : 1;
    for (let x = 0; x < VIEW_W; x += 8) {
      const wx = x + cam * speed;
      const h = amp + Math.round(Math.sin(wx * 0.03) * amp * 0.5 + Math.sin(wx * 0.011) * amp * 0.4);
      ctx.fillRect(x, base - h, 8, VIEW_H - (base - h));
    }
    ctx.globalAlpha = 1;
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, g: Game, cam: number) {
  const first = Math.max(0, Math.floor(cam / TILE));
  const last = Math.min(g.grid.cols - 1, first + VIEW_W / TILE + 1);
  for (let ty = 0; ty < g.grid.rows; ty += 1) {
    for (let tx = first; tx <= last; tx += 1) {
      const t = g.grid.at(tx, ty);
      const x = tx * TILE - cam;
      const y = ty * TILE;
      if (t === '#') {
        const open = g.grid.at(tx, ty - 1) !== '#';
        rect(ctx, g.level.dirt, x, y, TILE, TILE);
        rect(ctx, 'rgba(0,0,0,0.18)', x + 3, y + 7, 3, 2);
        rect(ctx, 'rgba(0,0,0,0.18)', x + 10, y + 3, 2, 2);
        if (open) {
          rect(ctx, g.level.grass, x, y, TILE, 5);
          rect(ctx, 'rgba(255,255,255,0.25)', x, y, TILE, 1);
          rect(ctx, g.level.grass, x + 2, y + 5, 2, 2);
          rect(ctx, g.level.grass, x + 9, y + 5, 2, 3);
        }
      } else if (t === '=') {
        rect(ctx, '#8a5a2b', x, y, TILE, 5);
        rect(ctx, '#c28a4b', x, y, TILE, 2);
        rect(ctx, '#5b3a1a', x, y + 4, TILE, 1);
      }
    }
  }
}

function drawToken(ctx: CanvasRenderingContext2D, look: string, x: number, y: number, bob: number) {
  const yy = y + bob;
  if (look === 'bonus stars') {
    rect(ctx, '#ffd84d', x + 5, yy + 1, 2, 10);
    rect(ctx, '#ffd84d', x + 1, yy + 5, 10, 2);
    rect(ctx, '#fff3a0', x + 3, yy + 3, 6, 6);
  } else if (look === 'session cards') {
    rect(ctx, '#10243a', x + 1, yy, 10, 12);
    rect(ctx, '#ffffff', x + 2, yy + 1, 8, 10);
    rect(ctx, '#22d3ee', x + 3, yy + 3, 6, 1);
    rect(ctx, '#22d3ee', x + 3, yy + 5, 6, 1);
    rect(ctx, '#a78bfa', x + 3, yy + 7, 4, 1);
  } else {
    rect(ctx, '#10243a', x, yy + 1, 12, 11);
    rect(ctx, '#ffffff', x + 1, yy + 2, 10, 9);
    rect(ctx, '#ff5c8a', x + 1, yy + 2, 10, 3);
    rect(ctx, '#10243a', x + 5, yy + 6, 1, 3);
    rect(ctx, '#10243a', x + 5, yy + 8, 3, 1);
  }
}

function drawNpc(ctx: CanvasRenderingContext2D, g: Game, cam: number, time: number) {
  if (!g.npc) return;
  const x = g.npc.tx * TILE - cam;
  const y = g.npc.ty * TILE;
  const look = g.level.npcLook;
  const bob = Math.round(Math.sin(time / 260));
  if (look === 'guide' || look === 'mate') {
    ctx.drawImage(look === 'guide' ? guideSheet() : mateSheet(), x, y - 14 + bob, 16, 16);
  } else if (look === 'speaker') {
    rect(ctx, '#5b3a1a', x + 2, y - 8, 12, 16);
    rect(ctx, '#8a5a2b', x + 1, y - 10, 14, 4);
    rect(ctx, '#c9d0dc', x + 7, y - 18, 2, 8);
    rect(ctx, '#10243a', x + 5, y - 22, 6, 5);
    rect(ctx, '#22d3ee', x + 6, y - 21, 4, 2);
  } else {
    rect(ctx, '#5b3a1a', x + 7, y - 4, 3, 12);
    rect(ctx, '#10243a', x, y - 20, 16, 16);
    rect(ctx, '#ffffff', x + 1, y - 19, 14, 14);
    rect(ctx, '#ff5c8a', x + 1, y - 19, 14, 4);
    for (let r = 0; r < 2; r += 1) for (let c = 0; c < 3; c += 1) rect(ctx, c === 1 && r === 0 ? '#22d3ee' : '#9aa3b2', x + 3 + c * 4, y - 13 + r * 4, 3, 2);
  }
  const state = talkState(g);
  if (state !== 'done' || g.nearNpc) {
    const mark = state === 'ready' ? '!' : state === 'locked' ? '…' : '✓';
    const color = state === 'ready' ? '#ffd84d' : '#c9d0dc';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#10243a';
    ctx.fillText(mark, x + 9, y - 25 - Math.abs(bob) + 1);
    ctx.fillStyle = color;
    ctx.fillText(mark, x + 8, y - 26 - Math.abs(bob) + 1);
  }
}

function drawFlag(ctx: CanvasRenderingContext2D, g: Game, cam: number, time: number) {
  const x = g.flag.tx * TILE - cam + 6;
  const base = (g.flag.ty + 1) * TILE;
  rect(ctx, '#e8edf5', x, base - 56, 3, 56);
  rect(ctx, '#ffd84d', x - 1, base - 59, 5, 4);
  rect(ctx, '#5b6b86', x - 5, base - 4, 11, 4);
  const open = g.questDone;
  const wave = Math.round(Math.sin(time / 180));
  const color = open ? '#2fbf84' : '#7a8397';
  for (let i = 0; i < 12; i += 1) rect(ctx, color, x + 3 + i, base - 54 + Math.floor(i / 3) + (open ? Math.round(Math.sin(time / 160 + i * 0.6)) : 0), 1, 14 - Math.floor(i / 2) - (i > 8 ? 1 : 0));
  if (open) rect(ctx, '#ffffff', x + 6, base - 49 + wave, 3, 3);
  else {
    rect(ctx, '#10243a', x + 6, base - 48, 5, 4);
    rect(ctx, '#10243a', x + 7, base - 51, 3, 3);
  }
}

export function drawGame(ctx: CanvasRenderingContext2D, g: Game, stage: StageKey, time: number) {
  const worldW = g.grid.cols * TILE;
  const cam = Math.max(0, Math.min(worldW - VIEW_W, Math.round(g.body.x + 5 - VIEW_W / 2)));
  ctx.imageSmoothingEnabled = false;
  drawSky(ctx, g, cam, time);
  drawTiles(ctx, g, cam);
  drawFlag(ctx, g, cam, time);
  drawNpc(ctx, g, cam, time);
  g.tokens.forEach((t) => {
    if (!t.got) drawToken(ctx, g.level.tokenLabel, t.tx * TILE - cam + 2, t.ty * TILE + 2, Math.round(Math.sin(time / 240 + t.tx)));
  });
  // Pet: sprite row 14 lines up with the bottom of the hitbox, so the feet sit on the ground.
  const b = g.body;
  const px = Math.round(b.x - 3 - cam);
  const py = Math.round(b.y + BODY_H - 14);
  const img = petSheet(stage);
  const walking = b.ground && Math.abs(b.vx) > 0.1;
  const hop = walking && Math.floor(time / 110) % 2 === 0 ? -1 : 0;
  ctx.save();
  if (b.facing === -1) {
    ctx.translate(px + 16, py + hop);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
  } else {
    ctx.drawImage(img, px, py + hop);
  }
  ctx.restore();
  rect(ctx, 'rgba(0,0,0,0.25)', px + 3, py + 14 + 1, 10, 1);
}
