/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auth footer text nodes', () => {
  it('keeps the privacy-policy period inside a Text expression', () => {
    const source = readFileSync(
      join(process.cwd(), 'apps/mobile-app/app/(shared)/auth.tsx'),
      'utf8',
    );

    expect(source).not.toContain(`</Text>\n                      .\n                    </Text>`);
  });
});
