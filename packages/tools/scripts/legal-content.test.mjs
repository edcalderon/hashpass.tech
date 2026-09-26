import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseLegalMarkdown } from '../lib/legal-content.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

test('parses canonical legal markdown into portable content blocks', () => {
  const document = parseLegalMarkdown({
    id: 'terms',
    sourcePath: 'docs/terms.md',
    sourceUrl: 'https://example.com/legal/terms/',
    markdown: `---
title: Terms of Service
description: Binding terms.
---

# Product Terms

**Effective date:** 25 September 2026<br />
**Operator:** Example OÜ

> **Revision.** Read the [notice](notice.md).

## 1. SERVICE

Wrapped first line
continues here.

- **Account data:** email and name
  when required.
- Wallet address
`,
  });

  assert.equal(document.title, 'Product Terms');
  assert.equal(document.revision, '25 September 2026');
  assert.deepEqual(document.blocks, [
    { type: 'paragraph', text: 'Effective date: 25 September 2026\nOperator: Example OÜ' },
    {
      type: 'quote',
      text: 'Revision. Read the notice (https://example.com/legal/notice).',
    },
    { type: 'heading', text: '1. SERVICE' },
    { type: 'paragraph', text: 'Wrapped first line continues here.' },
    {
      type: 'list',
      items: ['Account data: email and name when required.', 'Wallet address'],
    },
  ]);
});

test('canonical policies retain every published section', () => {
  const definitions = [
    ['terms', 'terms-of-service.md', 'terms-of-service/', 30],
    ['privacy', 'privacy-policy.md', 'privacy-policy/', 12],
  ];

  for (const [id, filename, slug, expectedHeadingCount] of definitions) {
    const sourcePath = `apps/docs/docs/legal/${filename}`;
    const document = parseLegalMarkdown({
      id,
      sourcePath,
      sourceUrl: `https://hashpass.club/documentation/legal/${slug}`,
      markdown: fs.readFileSync(path.join(repositoryRoot, sourcePath), 'utf8'),
    });

    assert.equal(document.revision, '25 September 2026');
    assert.equal(
      document.blocks.filter((block) => block.type === 'heading').length,
      expectedHeadingCount,
    );
    assert.ok(document.blocks.every((block) => (
      block.type === 'list'
        ? block.items.every(Boolean)
        : Boolean(block.text)
    )));
  }
});
