/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('auth footer text nodes', () => {
  it('keeps the privacy-policy period inside a Text expression', () => {
    const source = readFileSync(
      resolve(__dirname, '../../app/(shared)/auth.tsx'),
      'utf8',
    );

    expect(source).not.toContain(`</Text>\n                      .\n                    </Text>`);
  });
});
