import assert from 'node:assert/strict';
import test from 'node:test';

import {buildEventVideoBriefRequest} from '../scripts/lib/event-video-brief.mjs';

test('builds a constrained Claude brief for a reviewed event background loop', () => {
  const request = buildEventVideoBriefRequest({
    id: 'cbweek2026',
    title: 'Colombia Blockchain Week 2026',
    city: 'Medellín',
    country: 'Colombia',
    startDate: '2026-12-11',
    endDate: '2026-12-12',
    themes: ['blockchain', 'community', 'technology'],
  });

  assert.equal(request.model, 'configured-by-environment');
  assert.equal(request.max_tokens, 900);
  assert.match(request.messages[0].content, /Colombia Blockchain Week 2026/);
  assert.match(request.messages[0].content, /muted 8-second seamless 16:9 loop/);
  assert.match(request.messages[0].content, /No logos, lettering, dates, UI, or readable text/);
  assert.deepEqual(request.outputSchema.required, [
    'summary',
    'prompt',
    'negativePrompt',
    'reviewChecklist',
  ]);
});
