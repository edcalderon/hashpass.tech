import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalArchive } from '../src/sma/runtime.ts';
import { createControlPlaneModel, createDraftCompanion } from '../src/control-plane/model.ts';

test('control-plane model keeps the main Companion owner-controlled and portable', async () => {
  const archive = await createLocalArchive('owner@example.com');
  const model = createControlPlaneModel(archive);

  assert.equal(model.workspaceName, 'hashpass');
  assert.equal(model.projectName, 'companion-platform');
  assert.equal(model.plan.included, 2);
  assert.equal(model.plan.source, 'proposed-local-preview');
  assert.equal(model.companions.length, 1);
  assert.equal(model.companions[0].id, archive.manifest.agent.did);
  assert.equal(model.companions[0].controller, 'owner');
  assert.equal(model.companions[0].sma, 'connected');
});

test('new Companion cards are explicitly drafts with delegated scope pending', () => {
  const draft = createDraftCompanion('Coder Companion', 2);

  assert.equal(draft.status, 'draft');
  assert.equal(draft.role, 'coder');
  assert.equal(draft.controller, 'delegated');
  assert.equal(draft.sma, 'pending');
  assert.match(draft.id, /^draft:companion-/);
});
