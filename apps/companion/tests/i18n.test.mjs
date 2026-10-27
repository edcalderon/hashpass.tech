import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { ja } from '../src/i18n/ja.ts';
import { levels } from '../src/game/levels.ts';
import { filmScenes, readingMs } from '../src/film/scenes.ts';
import { capabilities, houseRules, stageKeys } from '../src/content.ts';
import { LOCALES, defaultSettings, localeInfo, parseSettings, pickLocale, serializeSettings } from '../../../packages/ui/src/settings/settings.ts';

const catalogs = { en, es, ja };
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every language has exactly the same keys as English', () => {
  const keys = Object.keys(en).sort();
  assert.ok(keys.length > 200, 'catalog is populated');
  for (const [code, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${code} keys match en`);
  }
});

test('no entry is empty and placeholders match English', () => {
  for (const [code, catalog] of Object.entries(catalogs)) {
    for (const [key, text] of Object.entries(catalog)) {
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${code}.${key} is not empty`);
      assert.deepEqual(placeholders(text), placeholders(en[key]), `${code}.${key} keeps the same placeholders`);
    }
  }
});

test('translations are not copies of English where the language differs', () => {
  const same = (catalog) => Object.keys(en).filter((k) => catalog[k] === en[k] && /[a-z]{4,} [a-z]{3,} [a-z]{3,}/i.test(en[k]));
  assert.deepEqual(same(es), [], 'es has no untranslated sentences');
  assert.deepEqual(same(ja), [], 'ja has no untranslated sentences');
  for (const text of Object.values(ja).filter((x) => x.length > 30)) assert.match(text, /[぀-ヿ一-龯]/, `ja text is Japanese: ${text}`);
});

test('every level has all its words in every language', () => {
  for (const level of levels) {
    const keys = ['title', 'badge', 'teaches', 'objective', 'done'].map((k) => `level.${level.id}.${k}`);
    if (level.npcLook) keys.push(`level.${level.id}.npc`);
    level.npcSteps.forEach((step, i) => {
      keys.push(`level.${level.id}.s${i}`);
      (step.choices ?? []).forEach((_, j) => keys.push(`level.${level.id}.s${i}.c${j}`, `level.${level.id}.s${i}.r${j}`));
    });
    for (const [code, catalog] of Object.entries(catalogs)) {
      for (const key of keys) assert.ok(catalog[key], `${code} has ${key}`);
    }
  }
});

test('every film scene, capability, stage and rule has its words', () => {
  const keys = [];
  for (const scene of filmScenes) keys.push(`film.${scene.id}.title`, `film.${scene.id}.line`);
  for (const row of capabilities) keys.push(row.key);
  for (const stage of stageKeys) keys.push(`stage.${stage}.name`, `stage.${stage}.trigger`, `stage.${stage}.note`);
  for (const rule of houseRules) keys.push(`${rule.id}.title`);
  for (const [code, catalog] of Object.entries(catalogs)) {
    for (const key of keys) assert.ok(catalog[key], `${code} has ${key}`);
  }
});

test('caption time grows with the text and reads kana slower per character', () => {
  assert.equal(readingMs('Hi', 'en'), 4200);
  assert.ok(readingMs('x'.repeat(200), 'en') > readingMs('x'.repeat(100), 'en'));
  assert.ok(readingMs('あ'.repeat(60), 'ja') > readingMs('a'.repeat(60), 'en'));
});

test('shared settings: only known values load, anything else falls back to defaults', () => {
  const env = { languages: ['en-US'], prefersReducedMotion: false };
  const defaults = defaultSettings(env);
  assert.deepEqual(parseSettings(null, env), defaults);
  assert.deepEqual(parseSettings('not json', env), defaults);
  const saved = { theme: 'dark', language: 'ja', animation: 'reduced', voice: true };
  assert.deepEqual(parseSettings(serializeSettings(saved), env), saved);
  const bad = parseSettings(JSON.stringify({ theme: 'neon', language: 'xx', animation: 'warp', voice: 'yes' }), env);
  assert.deepEqual(bad, defaults);
  assert.equal(defaults.voice, false, 'voice-over is off until someone turns it on');
  assert.equal(defaultSettings({ languages: ['ja-JP'], prefersReducedMotion: true }).language, 'ja');
  assert.equal(defaultSettings({ languages: ['en'], prefersReducedMotion: true }).animation, 'reduced');
});

test('shared settings: language is picked from the browser list', () => {
  assert.equal(pickLocale(['ja-JP', 'en-US']), 'ja');
  assert.equal(pickLocale(['fr-FR', 'es-MX']), 'es');
  assert.equal(pickLocale(['fr-FR']), 'en');
  assert.equal(pickLocale([]), 'en');
  assert.deepEqual(LOCALES.map((l) => l.code), ['en', 'es', 'ja']);
  assert.equal(localeInfo('ja').speechTag, 'ja-JP');
});
