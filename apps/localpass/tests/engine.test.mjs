import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildItinerary, extractQuery, searchPlaces } from '../src/engine.ts';

const pack = JSON.parse(await readFile(new URL('../data/guatape.json', import.meta.url)));

for (const amount of ['COP 20,000', '20,000 COP', 'cop 20.000', '20.000 cop', '$20,000', '20000 COP']) {
  test(`honors the explicit budget in ${amount}`, () => {
    const query = `I have 3 hours and ${amount}`;
    assert.equal(extractQuery(query).budget, 20_000);
    const plan = buildItinerary(pack, query, 'en');
    assert.ok(plan.length > 0);
    assert.ok(plan.reduce((total, item) => total + item.estimated_cost, 0) <= 20_000);
  });
}
test('default, zero, and bilingual time constraints remain bounded', () => {
  assert.equal(extractQuery('local food').budget, 100_000);
  assert.equal(extractQuery('Tengo 2 horas y 0 COP').hours, 2);
  const plan = buildItinerary(pack, 'Tengo 2 horas y 0 COP', 'es');
  assert.ok(plan.length > 0);
  assert.equal(plan.reduce((sum, item) => sum + item.estimated_cost, 0), 0);
  assert.ok(plan.reduce((sum, item) => sum + item.duration, 0) + (plan.length - 1) * 15 <= 120);
  assert.deepEqual(buildItinerary(pack, '0 hours', 'en'), []);
});
for (const [query, language, id] of [
  ['kayak', 'en', 'kayak-familiar'], ['coffee', 'en', 'cafe-la-vina'],
  ['Piedra del Peñol', 'es', 'piedra-penol'], ['Piedra del Penol', 'en', 'piedra-penol'],
  ['Quiero visitar la Piedra del Peñol, tengo 3 horas y 50.000 COP', 'es', 'piedra-penol'],
  ['I want coffee and have 2 hours and 20,000 COP', 'en', 'cafe-la-vina'],
]) {
  test(`prioritizes the requested place for ${query}`, () => {
    assert.equal(buildItinerary(pack, query, language)[0].place_id, id);
    assert.equal(searchPlaces(pack, query, language)[0].id, id);
  });
}
test('requested places cannot override budget, duration or offline safety', () => {
  assert.ok(!buildItinerary(pack, 'kayak 20,000 COP', 'en').some(item => item.place_id === 'kayak-familiar'));
  assert.ok(!buildItinerary(pack, 'Piedra del Peñol 1 hour', 'en').some(item => item.place_id === 'piedra-penol'));
  const unsafePack = { ...pack, places: pack.places.map(place => ({ ...place, offline_safe: false })) };
  assert.deepEqual(buildItinerary(unsafePack, 'coffee', 'en'), []);
  assert.deepEqual(searchPlaces(pack, 'unmatchablexyz', 'en'), []);
});
test('representative plans stay within total time and cost, without mutating the pack', () => {
  const original = structuredClone(pack);
  for (const language of ['en', 'es']) {
    for (const query of ['3 hours COP 100,000 nature food', '2 horas 50.000 COP comida', 'rainy day', 'cultura']) {
      const plan = buildItinerary(pack, query, language);
      const constraints = extractQuery(query);
      assert.ok(plan.length > 0 && plan.length <= 5);
      assert.ok(plan.reduce((sum, item) => sum + item.estimated_cost, 0) <= constraints.budget);
      assert.ok(plan.reduce((sum, item) => sum + item.duration, 0) + (plan.length - 1) * 15 <= constraints.hours * 60);
      for (let index = 1; index < plan.length; index++) {
        const start = item => item.start_time.split(':').reduce((hours, minutes) => Number(hours) * 60 + Number(minutes));
        assert.equal(start(plan[index]), start(plan[index - 1]) + plan[index - 1].duration + 15);
      }
    }
  }
  assert.deepEqual(pack, original);
});
