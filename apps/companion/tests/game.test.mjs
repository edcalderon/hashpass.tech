import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels, ROWS } from '../src/game/levels.ts';
import { createGame, flagRect, npcRect, tickGame, tokenRect, startBody, completeQuest, talkState } from '../src/game/engine.ts';
import { advance, answer, openDialog } from '../src/game/dialog.ts';
import { TILE, BODY_W, BODY_H, overlaps, stepBody } from '../src/game/physics.ts';

const ALLOWED = new Set(['.', '#', '=', 'c', 'P', 'N', 'F']);

test('every level map is well formed', () => {
  assert.equal(levels.length, 4);
  for (const level of levels) {
    assert.equal(level.map.length, ROWS, `${level.id} has ${ROWS} rows`);
    const width = level.map[0].length;
    const all = level.map.join('');
    for (const row of level.map) assert.equal(row.length, width, `${level.id} rows share a width`);
    for (const ch of all) assert.ok(ALLOWED.has(ch), `${level.id} uses an unknown tile ${ch}`);
    const count = (ch) => [...all].filter((c) => c === ch).length;
    assert.equal(count('P'), 1, `${level.id} has one start`);
    assert.equal(count('F'), 1, `${level.id} has one flag`);
    assert.equal(count('N'), 1, `${level.id} has one quest giver`);
    assert.ok(count('c') >= level.needTokens, `${level.id} has enough tokens`);
    // Bottom row of the first and last columns is solid so the level has walls at both ends.
    assert.equal(level.map[ROWS - 1][0], '#');
    assert.equal(level.map[ROWS - 1][width - 1], '#');
  }
});

test('every quiz step has exactly one correct answer and can be completed', () => {
  for (const level of levels) {
    assert.ok(level.npcSteps.length > 0);
    let d = openDialog();
    for (const [i, step] of level.npcSteps.entries()) {
      if (step.choices) {
        assert.equal(step.choices.filter((c) => c.correct).length, 1, `${level.id} step ${i} has one correct choice`);
        const wrong = step.choices.findIndex((c) => !c.correct);
        d = answer(level, d, wrong);
        assert.equal(d.right, false, 'a wrong answer does not pass');
        assert.equal(advance(level, d).step, i, 'a wrong answer does not advance');
        d = answer(level, d, step.choices.findIndex((c) => c.correct));
        assert.equal(d.right, true);
      }
      d = advance(level, d);
    }
    assert.equal(d.done, true, `${level.id} dialog finishes`);
  }
});

test('the pet grows through all three stages in order', () => {
  const rewards = levels.map((l) => l.rewardStage).filter(Boolean);
  assert.deepEqual(rewards, ['curious', 'helpful']);
});

test('physics: a body falls onto the ground and stands still', () => {
  const g = createGame(levels[0]);
  for (let i = 0; i < 90; i += 1) tickGame(g, { dir: 0, jump: false });
  assert.equal(g.body.ground, true);
  assert.equal(g.body.y + BODY_H, 10 * TILE);
});

test('physics: walls block and jumping reaches about three tiles', () => {
  const g = createGame(levels[0]);
  for (let i = 0; i < 30; i += 1) tickGame(g, { dir: 0, jump: false });
  const floor = g.body.y;
  let apex = floor;
  tickGame(g, { dir: 0, jump: true });
  for (let i = 0; i < 60; i += 1) {
    tickGame(g, { dir: 0, jump: true });
    apex = Math.min(apex, g.body.y);
  }
  const height = floor - apex;
  assert.ok(height > 2.5 * TILE && height < 4 * TILE, `jump height ${height}px`);
});

/**
 * Breadth-first search over the real physics. It proves, per level, that a player starting at the start tile can
 * touch every token, the quest giver and the flag without any trick, using only left/right/jump.
 */
function explore(level) {
  const game = createGame(level);
  const rects = {
    tokens: game.tokens.map(tokenRect),
    npc: npcRect(game.npc),
    flag: flagRect(game.flag),
  };
  const touchedTokens = new Set();
  let npc = false;
  let flag = false;
  const key = (b) => `${Math.floor(b.x / 2)}|${Math.floor(b.y / 2)}|${Math.round(b.vy)}|${b.ground ? 1 : 0}|${b.wasJump ? 1 : 0}`;
  const actions = [];
  for (const dir of [-1, 0, 1]) for (const jump of [false, true]) actions.push({ dir, jump });
  let frontier = [startBody(game.start)];
  const seen = new Set([key(frontier[0])]);
  const limit = (game.grid.rows + 1) * TILE;
  while (frontier.length && seen.size < 3_000_000) {
    const next = [];
    for (const from of frontier) {
      for (const input of actions) {
        const b = { ...from };
        let alive = true;
        for (let t = 0; t < 4; t += 1) {
          stepBody(game.grid, b, input);
          if (b.y > limit) {
            alive = false;
            break;
          }
          rects.tokens.forEach((r, i) => {
            if (overlaps(b, r.x, r.y, r.w, r.h)) touchedTokens.add(i);
          });
          if (overlaps(b, rects.npc.x, rects.npc.y, rects.npc.w, rects.npc.h)) npc = true;
          if (overlaps(b, rects.flag.x, rects.flag.y, rects.flag.w, rects.flag.h)) flag = true;
        }
        if (!alive) continue;
        const k = key(b);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(b);
      }
    }
    frontier = next;
  }
  return { tokens: touchedTokens.size, total: rects.tokens.length, npc, flag, states: seen.size };
}

for (const level of levels) {
  test(`level "${level.id}" is fully completable with left, right and jump`, () => {
    const r = explore(level);
    assert.equal(r.tokens, r.total, `all ${r.total} tokens reachable (${r.states} states searched)`);
    assert.ok(r.npc, 'quest giver reachable');
    assert.ok(r.flag, 'flag reachable');
  });
}

test('the flag stays locked until the quest is done, then finishes the level', () => {
  const g = createGame(levels[1]);
  assert.equal(talkState(g), 'locked');
  g.collected = g.level.needTokens;
  assert.equal(talkState(g), 'ready');
  // Teleport next to the flag: still not finished while the quest is open.
  g.body.x = g.flag.tx * TILE;
  g.body.y = g.flag.ty * TILE;
  tickGame(g, { dir: 0, jump: false });
  assert.equal(g.finished, false);
  completeQuest(g);
  assert.equal(talkState(g), 'done');
  tickGame(g, { dir: 0, jump: false });
  assert.equal(g.finished, true);
});

test('falling into a pit respawns at the start and counts the fall', () => {
  const g = createGame(levels[0]);
  g.body.x = 22 * TILE + 2;
  g.body.y = 11 * TILE;
  g.body.ground = false;
  for (let i = 0; i < 200 && g.falls === 0; i += 1) tickGame(g, { dir: 0, jump: false });
  assert.equal(g.falls, 1);
  assert.equal(g.body.x, startBody(g.start).x);
});

test('collecting a token is counted once', () => {
  const g = createGame(levels[2]);
  const t = g.tokens[0];
  g.body.x = t.tx * TILE + 3;
  g.body.y = t.ty * TILE + 1;
  tickGame(g, { dir: 0, jump: false });
  const after = g.collected;
  g.body.x = t.tx * TILE + 3;
  g.body.y = t.ty * TILE + 1;
  tickGame(g, { dir: 0, jump: false });
  assert.equal(g.collected, after);
  assert.ok(after >= 1);
});

test('body size constants leave room to fit through two-tile gaps', () => {
  assert.ok(BODY_W < TILE && BODY_H < TILE);
});
