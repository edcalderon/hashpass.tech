import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const pack=JSON.parse(await readFile(new URL('../data/guatape.json',import.meta.url)));
test('pack is compact, bilingual, and scoped to Guatapé',()=>{assert.equal(pack.destination.id,'guatape');assert.deepEqual(pack.destination.languages,['es','en']);assert.ok(Buffer.byteLength(JSON.stringify(pack))<100_000);});
test('pack includes enough offline-safe places and local operators',()=>{assert.ok(pack.places.length>=10);assert.ok(pack.places.filter(p=>p.local_business).length>=8);assert.ok(pack.places.every(p=>p.offline_safe&&p.description_en&&p.description_es));});
test('essential pack covers the minimum safety set',()=>{for(const type of ['transport','emergency','health','phrases','safety','accommodation'])assert.ok(pack.essential.some(item=>item.type===type));});

test('every place includes Spanish business metadata and supported payment labels', () => {
  for (const place of pack.places) {
    assert.ok(place.category_es && place.location_es && place.opening_hours_es, place.id);
    assert.ok(place.accepted_payments.every(payment => ['cash', 'card'].includes(payment)));
    assert.doesNotMatch(place.location_es + place.opening_hours_es, /Daily|Near the|Main square|weather dependent|verify|hours/);
  }
});
test('downloadable pack matches the bundled destination pack', async () => {
  const publicPack = JSON.parse(await readFile(new URL('../public/data/guatape.json', import.meta.url)));
  assert.deepEqual(publicPack, pack);
});
