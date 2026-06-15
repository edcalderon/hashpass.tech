import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const distRoot = path.join(appRoot, 'dist');
const siteUrl = 'https://hashpass.tech';
const socialImage = `${siteUrl}/assets/hashpass-social-card-1200x630.png`;
const indexRobots =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const noIndexRobots = 'noindex, nofollow, noarchive';

const defaultSeo = {
  title: 'HashPass | Events, Digital Passes and Networking',
  description:
    'Discover events, manage verified digital passes, build your agenda, and connect with the people who matter through HashPass.',
};

const routeSeo = {
  '/': {
    ...defaultSeo,
    canonical: `${siteUrl}/home`,
  },
  '/home': {
    ...defaultSeo,
    canonical: `${siteUrl}/home`,
  },
  '/docs': {
    title: 'HashPass Documentation',
    description:
      'Learn how to use HashPass events, verified digital passes, QR check-in, agendas, and networking features.',
    canonical: `${siteUrl}/docs`,
  },
  '/support': {
    title: 'HashPass Support',
    description:
      'Get support for HashPass events, digital passes, account access, QR check-in, and networking features.',
    canonical: `${siteUrl}/support`,
  },
  '/privacy': {
    title: 'Privacy Policy | HashPass',
    description:
      'Read the HashPass privacy policy and learn how information is handled across events, passes, and community features.',
    canonical: `${siteUrl}/privacy`,
  },
  '/terms': {
    title: 'Terms of Service | HashPass',
    description:
      'Read the terms that govern use of HashPass event, digital pass, agenda, and networking services.',
    canonical: `${siteUrl}/terms`,
  },
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const upsertTitle = (html, title) => {
  const tag = `<title>${escapeHtml(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, tag)
    : html.replace('</head>', `${tag}</head>`);
};

const upsertMeta = (html, attribute, key, content) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`,
    'i'
  );
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}"/>`;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace('</head>', `${tag}</head>`);
};

const setCanonical = (html, canonical) => {
  const withoutCanonical = html.replace(
    /<link\s+rel=["']canonical["'][^>]*>/gi,
    ''
  );

  if (!canonical) {
    return withoutCanonical;
  }

  return withoutCanonical.replace(
    '</head>',
    `<link rel="canonical" href="${escapeHtml(canonical)}"/></head>`
  );
};

const routeFromFile = (filePath) => {
  const relativePath = path
    .relative(distRoot, filePath)
    .replaceAll(path.sep, '/')
    .replace(/^server\//, '')
    .replace(/^client\//, '')
    .replace(/\.html$/, '')
    .replace(/(^|\/)\([^/]+\)/g, '$1')
    .replace(/(^|\/)index$/, '')
    .replace(/\/+/g, '/');

  return relativePath ? `/${relativePath.replace(/^\/+/, '')}` : '/';
};

const isPrivateRoute = (route) =>
  route === '/auth' ||
  route.startsWith('/auth/') ||
  route === '/dashboard' ||
  route.startsWith('/dashboard/') ||
  route === '/oauth-callback' ||
  route === '/offline' ||
  route === '/+not-found' ||
  route === '/_sitemap' ||
  route === '/status';

const patchHtml = (html, route) => {
  const privateRoute = isPrivateRoute(route);
  const seo = routeSeo[route] || defaultSeo;
  const title = privateRoute
    ? route.startsWith('/auth')
      ? 'Sign in | HashPass'
      : 'HashPass App'
    : seo.title;
  const description = seo.description || defaultSeo.description;
  const robots = privateRoute ? noIndexRobots : indexRobots;

  let nextHtml = upsertTitle(html, title);
  nextHtml = upsertMeta(nextHtml, 'name', 'description', description);
  nextHtml = upsertMeta(nextHtml, 'name', 'robots', robots);
  nextHtml = upsertMeta(nextHtml, 'name', 'googlebot', robots);
  nextHtml = upsertMeta(nextHtml, 'property', 'og:title', title);
  nextHtml = upsertMeta(nextHtml, 'property', 'og:description', description);
  nextHtml = upsertMeta(
    nextHtml,
    'property',
    'og:url',
    privateRoute ? siteUrl : seo.canonical || siteUrl
  );
  nextHtml = upsertMeta(nextHtml, 'property', 'og:image', socialImage);
  nextHtml = upsertMeta(nextHtml, 'name', 'twitter:title', title);
  nextHtml = upsertMeta(nextHtml, 'name', 'twitter:description', description);
  nextHtml = upsertMeta(nextHtml, 'name', 'twitter:image', socialImage);
  nextHtml = setCanonical(
    nextHtml,
    privateRoute ? null : seo.canonical || null
  );

  return nextHtml;
};

const collectHtmlFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
};

const main = async () => {
  const htmlFiles = await collectHtmlFiles(distRoot);
  let patchedCount = 0;

  for (const filePath of htmlFiles) {
    const route = routeFromFile(filePath);
    const html = await fs.readFile(filePath, 'utf8');
    const patchedHtml = patchHtml(html, route);

    if (patchedHtml !== html) {
      await fs.writeFile(filePath, patchedHtml, 'utf8');
      patchedCount += 1;
    }
  }

  console.log(`Patched SEO metadata in ${patchedCount} generated HTML files.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
