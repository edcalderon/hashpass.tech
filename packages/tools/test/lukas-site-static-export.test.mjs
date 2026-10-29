import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const stackRoot = path.join(repoRoot, 'packages/infra/terraform/stacks/hashpass-lukas-site');
const buildScript = path.join(stackRoot, 'build.py');
const canonicalUrl = 'https://lukas.hashpass.tech/lukas';
const description = '$LUKAS tracks a weighted LatAm currency basket and is designed for payments with HashPass merchants, backed by omni-chain crypto collateral.';

function tags(html, name) {
  return html.match(new RegExp(`<${name}[^>]*>`, 'gi')) ?? [];
}

function metaContent(html, attribute, key) {
  const matches = tags(html, 'meta').filter((tag) => tag.includes(`${attribute}="${key}"`));
  assert.equal(matches.length, 1, `Expected exactly one meta ${attribute}="${key}"`);
  const content = matches[0].match(/content="([^"]*)"/i);
  assert.ok(content, `Expected ${attribute}="${key}" to have a content value`);
  return content[1];
}

function linkTags(html, rel) {
  return tags(html, 'link').filter((tag) => tag.includes(`rel="${rel}"`));
}

function titleText(html) {
  const start = html.indexOf('<title>');
  const end = html.indexOf('</title>', start);
  assert.ok(start >= 0 && end > start, 'Expected a title element');
  return html.slice(start + '<title>'.length, end);
}

function jsonLd(html) {
  const openingTag = '<script type="application/ld+json">';
  const count = html.split(openingTag).length - 1;
  assert.equal(count, 1, 'Expected exactly one JSON-LD script per landing document');
  const start = html.indexOf(openingTag) + openingTag.length;
  const end = html.indexOf('</script>', start);
  assert.ok(end > start, 'Expected a closed JSON-LD script');
  return JSON.parse(html.slice(start, end));
}

test('LUKAS static export emits crawlable SEO metadata and crawler assets without i18n warnings', (t) => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'lukas-seo-test-'));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));
  const outputDirectory = path.join(workDir, 'site');

  const result = spawnSync('python3', [buildScript, outputDirectory], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  assert.equal(result.status, 0, result.error?.message ?? output.slice(-4000));
  const warningCount = output.match(/Uncompiled message detected/g)?.length ?? 0;
  assert.equal(warningCount, 0, `Static export emitted ${warningCount} uncompiled-message warnings.`);

  const landingPages = ['index.html', 'lukas.html'].map((filename) =>
    readFileSync(path.join(outputDirectory, filename), 'utf8'),
  );
  for (const html of landingPages) {
    assert.equal(titleText(html), 'LUKAS | Stable value for LatAm payments');
    assert.equal(metaContent(html, 'name', 'description'), description);
    assert.equal(metaContent(html, 'name', 'robots'), 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    assert.equal(metaContent(html, 'name', 'googlebot'), 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    assert.equal(metaContent(html, 'property', 'og:title'), 'LUKAS | Stable value for LatAm payments');
    assert.equal(metaContent(html, 'name', 'twitter:title'), 'LUKAS | Stable value for LatAm payments');
    assert.equal(metaContent(html, 'property', 'og:description'), description);
    assert.equal(metaContent(html, 'name', 'twitter:description'), description);
    assert.equal(metaContent(html, 'property', 'og:locale'), 'en_US');
    assert.equal(metaContent(html, 'property', 'og:url'), canonicalUrl);
    assert.equal(metaContent(html, 'property', 'og:image'), 'https://lukas.hashpass.tech/lukas-social-card.png');
    assert.equal(metaContent(html, 'property', 'og:image:secure_url'), 'https://lukas.hashpass.tech/lukas-social-card.png');
    assert.equal(metaContent(html, 'property', 'og:image:alt'), 'LUKAS stable value for LatAm payments');
    assert.equal(metaContent(html, 'name', 'twitter:image'), 'https://lukas.hashpass.tech/lukas-social-card.png');
    assert.equal(metaContent(html, 'name', 'twitter:image:alt'), 'LUKAS stable value for LatAm payments');
    assert.equal(metaContent(html, 'property', 'og:image:type'), 'image/png');
    assert.equal(metaContent(html, 'property', 'og:image:width'), '1200');
    assert.equal(metaContent(html, 'property', 'og:image:height'), '630');
    assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.equal(linkTags(html, 'canonical').length, 1);
    assert.equal(linkTags(html, 'canonical')[0].match(/href="([^"]+)"/i)?.[1], canonicalUrl);
    assert.doesNotMatch(html, /hreflang=/i);

    const structuredData = jsonLd(html);
    assert.equal(structuredData['@context'], 'https://schema.org');
    assert.deepEqual(structuredData['@graph'].map((item) => item['@type']).sort(), ['WebPage', 'WebSite']);
    const website = structuredData['@graph'].find((item) => item['@type'] === 'WebSite');
    const webpage = structuredData['@graph'].find((item) => item['@type'] === 'WebPage');
    assert.equal(website.name, 'LUKAS');
    assert.equal(website.description, description);
    assert.equal(website.inLanguage, 'en');
    assert.equal(webpage.url, canonicalUrl);
    assert.equal(webpage.description, description);
    assert.equal(webpage.inLanguage, 'en');
    assert.equal(webpage.isPartOf['@id'], website['@id']);
    assert.doesNotMatch(JSON.stringify(structuredData), /Product|Offer|FAQPage/);
  }

  const lineBreak = String.fromCharCode(10);
  const robots = readFileSync(path.join(outputDirectory, 'robots.txt'), 'utf8');
  assert.equal(robots, ['User-agent: *', 'Allow: /', 'Sitemap: https://lukas.hashpass.tech/sitemap.xml', ''].join(lineBreak));
  const sitemap = readFileSync(path.join(outputDirectory, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  const sitemapLocations = [];
  let searchFrom = 0;
  while (true) {
    const start = sitemap.indexOf('<loc>', searchFrom);
    if (start < 0) break;
    const end = sitemap.indexOf('</loc>', start);
    assert.ok(end > start, 'Expected every sitemap location to close');
    sitemapLocations.push(sitemap.slice(start + '<loc>'.length, end).trim());
    searchFrom = end + '</loc>'.length;
  }
  assert.deepEqual(sitemapLocations, [canonicalUrl]);

  for (const filename of ['404.html', '+not-found.html']) {
    const notFound = readFileSync(path.join(outputDirectory, filename), 'utf8');
    assert.equal(titleText(notFound), 'LUKAS | Page not found');
    assert.equal(metaContent(notFound, 'name', 'robots'), 'noindex, nofollow, noarchive');
    assert.equal(metaContent(notFound, 'name', 'googlebot'), 'noindex, nofollow, noarchive');
    assert.equal(tags(notFound, 'meta').filter((tag) => tag.includes('name="description"')).length, 0);
    assert.equal(linkTags(notFound, 'canonical').length, 0);
    assert.equal(tags(notFound, 'meta').filter((tag) => tag.includes('property="og:') || tag.includes('name="twitter:')).length, 0);
    assert.equal(tags(notFound, 'script').filter((tag) => tag.includes('type="application/ld+json"')).length, 0);
  }

  const socialImage = readFileSync(path.join(outputDirectory, 'lukas-social-card.png'));
  assert.deepEqual([...socialImage.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(socialImage.readUInt32BE(16), 1200);
  assert.equal(socialImage.readUInt32BE(20), 630);

  const faviconSource = path.join(stackRoot, 'overrides/public/favicon.ico');
  assert.ok(existsSync(faviconSource), 'Expected a checked-in LUKAS-branded favicon.ico.');
  const favicon = readFileSync(path.join(outputDirectory, 'favicon.ico'));
  assert.deepEqual(favicon, readFileSync(faviconSource), 'Expected the static export to replace Expo’s default favicon.ico.');
  assert.equal(favicon.readUInt16LE(0), 0, 'Expected a valid ICO reserved field.');
  assert.equal(favicon.readUInt16LE(2), 1, 'Expected a valid ICO type field.');
  const iconCount = favicon.readUInt16LE(4);
  assert.ok(iconCount >= 2, 'Expected at least 16px and 32px favicon sizes.');
  const iconSizes = Array.from({ length: iconCount }, (_, index) => favicon[6 + index * 16] || 256);
  assert.ok(iconSizes.includes(16) && iconSizes.includes(32), 'Expected both 16px and 32px favicon sizes.');

  const terraform = readFileSync(path.join(stackRoot, 'main.tf'), 'utf8');
  assert.ok(terraform.includes('error_code            = 403'));
  assert.ok(terraform.includes('response_code         = 404'));
  assert.ok(terraform.includes('response_page_path    = "/404.html"'));

  const deployScript = readFileSync(path.join(repoRoot, 'packages/tools/scripts/deploy-lukas-landing.sh'), 'utf8');
  for (const expectedCheck of [description, 'robots.txt', 'sitemap.xml', 'og:description', 'twitter:description', 'image/png', 'favicon.ico', 'verify_favicon_ico', 'image/vnd.microsoft.icon']) {
    assert.ok(deployScript.includes(expectedCheck), `Post-publish verifier must check ${expectedCheck}.`);
  }
});
