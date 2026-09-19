/// <reference types="jest" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(__dirname, '../../../..');
const target = 'https://hashpass.club/documentation/media-kit';

describe('media kit public redirect', () => {
  it('provides a canonical destination and a no-JavaScript fallback', () => {
    const html = fs.readFileSync(path.join(root, 'apps/mobile-app/public/mediakit.html'), 'utf8');
    expect(html).toContain(`content="0;url=${target}"`);
    expect(html).toContain(`<link rel="canonical" href="${target}">`);
    expect(html).toContain(`<a href="${target}">`);
  });

  it.each([true, false])('deploys redirects only when the kit fallback is in the build (%s)', (includeKit) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'media-kit-redirect-'));
    try {
      const build = path.join(temp, 'build');
      fs.mkdirSync(build);
      fs.writeFileSync(path.join(build, 'index.html'), '<html></html>');
      if (includeKit) fs.copyFileSync(path.join(root, 'apps/mobile-app/public/mediakit.html'), path.join(build, 'mediakit.html'));
      const log = path.join(temp, 'calls.jsonl');
      fs.writeFileSync(path.join(temp, 'aws'), `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.TEST_AWS_LOG, JSON.stringify(process.argv.slice(2))+'\\n');\n`, { mode: 0o755 });
      execFileSync('bash', [path.join(root, 'packages/tools/scripts/deploy-static-site.sh')], {
        env: {
          PATH: `${temp}:${process.env.PATH}`, HOME: temp, TEST_AWS_LOG: log,
          SITE_BUILD_DIR: build, SITE_BUCKET_NAME: 'test-media-kit-bucket',
          SITE_SKIP_LAMBDA_DEPLOY: 'true', SITE_SKIP_API_VERSION_VERIFY: 'true',
          SITE_CLOUDFRONT_DISTRIBUTION_ID: 'test-distribution',
        },
      });
      const calls: string[][] = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const redirects = calls.filter(args => args.includes('--website-redirect'));
      expect(redirects).toHaveLength(includeKit ? 3 : 0);
      if (includeKit) {
        expect(redirects.map(args => args[3])).toEqual(['mediakit', 'mediakit/', 'mediakit.html'].map(key => `s3://test-media-kit-bucket/${key}`));
        for (const args of redirects) {
          expect(args[args.indexOf('--website-redirect') + 1]).toBe(target);
          expect(args[args.indexOf('--cache-control') + 1]).toBe('public,max-age=300');
        }
        expect(calls.indexOf(redirects[0])).toBeGreaterThan(calls.findIndex(args => args[1] === 'sync'));
        expect(calls.indexOf(redirects[2])).toBeLessThan(calls.findIndex(args => args[1] === 'create-invalidation'));
      }
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
