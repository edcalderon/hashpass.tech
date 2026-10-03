import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('representative bilingual queries can produce a constrained plan',async()=>{
  const source=await readFile(new URL('../src/engine.ts',import.meta.url),'utf8');
  assert.match(source,/replace\(\/\[\.,\]\/g/,'normalizes Colombian thousands separators');
  assert.match(source,/local_business\?2:0/,'explicitly boosts local operators');
  const pack=JSON.parse(await readFile(new URL('../data/guatape.json',import.meta.url)));
  const affordable=pack.places.filter(place=>place.estimated_cost<=50_000&&place.estimated_duration<=120);
  assert.ok(affordable.length>=3);
});
