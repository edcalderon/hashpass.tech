import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMissionControlHtml, planeKit, webKit } from '../scripts/mission-control-page.mjs';
import { statusDocument } from '../scripts/build-status-page.mjs';

const data = {
  now: new Date('2026-10-27T08:00:00Z'),
  sha: 'abc1234',
  epic: [
    { number: 1, title: '[P0] Ship it', state: 'closed', html_url: 'https://github.com/o/r/issues/1' },
    { number: 2, title: '[P1] Polish', state: 'open', html_url: 'https://github.com/o/r/issues/2' },
  ],
  passport: { number: 425 },
  passportKids: [],
  modules: [{ id: 'm1', name: 'Strategy and validation', status: 'started', total: 4, open: 3 }],
  surfaces: [{ name: 'API', url: 'https://api.example/x', up: true }, { name: 'Site', url: 'https://example', up: false }],
};
const headings = (html) => [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/g)].map((m) => m[1]);

test('every section appears once, so a page never stacks duplicated content', () => {
  const h = headings(buildMissionControlHtml(data));
  assert.equal(new Set(h).size, h.length);
});

test('the Plane page and the status page are the same document structure', () => {
  const plane = headings(buildMissionControlHtml(data, planeKit));
  const web = headings(buildMissionControlHtml(data, webKit, { publicView: true }));
  assert.deepEqual(web, plane);
});

test('the status page leaves out private Plane work counts and login-only links', () => {
  const html = buildMissionControlHtml(data, webKit, { publicView: true });
  assert.doesNotMatch(html, /Open company work/);
  assert.doesNotMatch(html, /3 open of 4/);
  assert.doesNotMatch(html, /work\.hashpass\.tech\/plane/);
  assert.match(buildMissionControlHtml(data, planeKit), /3 open of 4/);
});

test('Plane tints use the attribute its editor stores, and the web kit uses plain CSS', () => {
  assert.match(buildMissionControlHtml(data, planeKit), /<td background="var\(--editor-colors-/);
  assert.match(buildMissionControlHtml(data, webKit, { publicView: true }), /<td[^>]* style="background:var\(--editor-colors-/);
});

test('the status document is a complete, indexable-off page', () => {
  const doc = statusDocument('<p>x</p>', 'now');
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /name="robots" content="noindex,nofollow"/);
});

test('the status document is team-only: sign-out link, no "public" claim, noindex', () => {
  const doc = statusDocument('<p>x</p>', 'now');
  assert.match(doc, /href="\/status\/logout"/);
  assert.match(doc, /Team only/);
  assert.doesNotMatch(doc, /public/i);
});

test('summary rows are a wrapping grid on the web and a single-row table in Plane', () => {
  const web = buildMissionControlHtml(data, webKit, { publicView: true });
  assert.match(web, /<div class="tiles">/);
  assert.doesNotMatch(web, /<table><tbody><tr><td/);
  assert.match(buildMissionControlHtml(data, planeKit), /<table><tbody><tr><td background=/);
  assert.match(statusDocument('', 'now'), /\.tiles\{display:grid;/);
});

test('web table cells carry their column title so a phone can stack rows as cards', () => {
  const web = buildMissionControlHtml(data, webKit, { publicView: true });
  assert.match(web, /<td data-label="Surface"/);
  assert.match(web, /<td data-label="Status" style=/);
  assert.doesNotMatch(buildMissionControlHtml(data, planeKit), /data-label/);
});

test('the status page drops login-only links by flag, not by matching the URL prefix', () => {
  const html = buildMissionControlHtml(data, webKit, { publicView: true });
  assert.doesNotMatch(html, /Plane issues/);
  assert.doesNotMatch(html, /Plane divisions/);
  assert.match(html, /GitHub project #4/);
  assert.match(buildMissionControlHtml(data, planeKit), /Plane issues/);
});
