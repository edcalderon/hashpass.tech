const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const publicDir = path.join(root, 'apps/web-app/public/attending');
const outputDir = path.join(publicDir, 'email-previews');
const attendeePhotos = {
  es: path.join(__dirname, 'assets/fictional-attendee-woman.png'),
  en: path.join(__dirname, 'assets/fictional-attendee-man.png'),
};

function dataUri(file, contentType) {
  return `data:${contentType};base64,${fs.readFileSync(file).toString('base64')}`;
}

function artwork(locale, assets) {
  const es = locale === 'es';
  const headline = es
    ? '<tspan x="76">VOY A</tspan><tspan x="76" dy="112">ASISTIR</tspan>'
    : '<tspan x="76">I’M</tspan><tspan x="76" dy="96">ATTENDING</tspan>';
  const headlineSize = es ? 104 : 68;
  const date = es ? '4–6 nov. 2026' : 'Nov 4–6, 2026';
  const poweredBy = es ? 'IMPULSADO POR' : 'POWERED BY';
  const poweredByLabelWidth = poweredBy.length * 9;
  const poweredByGroupWidth = poweredByLabelWidth + 18 + 150;
  const poweredByGroupLeft = (1080 - poweredByGroupWidth) / 2;
  const poweredByLabelRight = poweredByGroupLeft + poweredByLabelWidth;
  const hashpassLogoX = poweredByLabelRight + 18;
  const identity = es ? 'Valentina  ·  Desarrolladora Web3' : 'Joe Doe  ·  Product Designer';
  const socialHandles = es
    ? [{ platform: 'x', handle: '@vale_demo2026' }, { platform: 'instagram', handle: '@valentina.demo' }]
    : [{ platform: 'x', handle: '@joe_doe_demo' }, { platform: 'instagram', handle: '@joe.doe.demo' }];
  let socialX = (1080 - socialHandles.reduce((total, item) => total + 31 + item.handle.length * 11, 0) - 36) / 2;
  const socials = socialHandles.map(({ platform, handle }) => {
    const iconX = socialX;
    const labelX = iconX + 31;
    const group = platform === 'x'
      ? `<path d="M18.901 1.153h3.68l-8.04 9.19 9.46 12.504h-7.41l-5.804-7.588-6.64 7.588H.466l8.6-9.83L0 1.153h7.598l5.245 6.932z" transform="translate(${iconX} 1080) scale(.9167)" fill="#f3f8ff"/>`
      : `<g transform="translate(${iconX} 1080)" fill="none" stroke="#f3f8ff" stroke-width="2.2"><rect x="1" y="1" width="20" height="20" rx="5.9"/><circle cx="11" cy="11" r="4.4"/><circle cx="15.4" cy="6.6" r="1.3" fill="#f3f8ff" stroke="none"/></g>`;
    const markup = `${group}<text x="${labelX}" y="1099" fill="#f3f8ff" font-family="Arial,sans-serif" font-size="22" font-weight="600">${handle}</text>`;
    socialX += 31 + handle.length * 11 + 36;
    return markup;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="wash" x2="0" y2="1"><stop stop-color="#020c2a" stop-opacity=".2"/><stop offset=".64" stop-color="#020c2a" stop-opacity=".14"/><stop offset="1" stop-color="#020c2a" stop-opacity=".74"/></linearGradient>
    <linearGradient id="left"><stop stop-color="#010923" stop-opacity=".84"/><stop offset=".74" stop-color="#010f30" stop-opacity=".4"/><stop offset="1" stop-color="#010f30" stop-opacity="0"/></linearGradient>
    <linearGradient id="glass" x2="0" y2="1"><stop stop-color="#020c2a" stop-opacity=".84"/><stop offset="1" stop-color="#01081f" stop-opacity=".91"/></linearGradient>
    <clipPath id="frame"><rect x="16" y="16" width="1048" height="1318" rx="48"/></clipPath>
    <clipPath id="portrait"><rect x="470" y="22" width="554" height="910"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <image href="${assets.background}" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
    <rect width="1080" height="1350" fill="url(#wash)"/><rect width="660" height="760" fill="url(#left)"/>
    <g fill="none" stroke="#27d8ff" stroke-opacity=".24" stroke-width="2"><circle cx="1115" cy="90" r="245"/><circle cx="1115" cy="90" r="299"/><circle cx="1115" cy="90" r="353"/><circle cx="-26" cy="714" r="245"/><circle cx="-26" cy="714" r="299"/></g>
    <image href="${assets.attendee}" x="368" y="22" width="758" height="910" preserveAspectRatio="none" clip-path="url(#portrait)"/>
    <rect x="54" y="44" width="448" height="256" rx="34" fill="#020b26" fill-opacity=".86" stroke="#27d8ff" stroke-opacity=".42" stroke-width="2"/>
    <image href="${assets.bslLogo}" x="78" y="57" width="400" height="178" preserveAspectRatio="xMidYMid meet"/>
    <rect x="109" y="244" width="169" height="9" fill="#fcd116"/><rect x="278" y="244" width="84.5" height="9" fill="#003893"/><rect x="362.5" y="244" width="84.5" height="9" fill="#ce1126"/>
    <text x="278" y="282" fill="#f3f8ff" text-anchor="middle" font-family="monospace" font-size="16" font-weight="700">BSL · COLOMBIA 2026</text>
    <text x="58" y="358" fill="#27d8ff" font-family="monospace" font-size="22" font-weight="700">BSL</text>
    <text y="466" fill="#f7fbff" font-family="Georgia,serif" font-size="${headlineSize}" font-weight="700">${headline}</text>
    <rect x="58" y="626" width="124" height="8" fill="#27d8ff"/><rect x="198" y="626" width="52" height="8" fill="#156bff"/>
    <rect x="56" y="686" width="968" height="643" rx="46" fill="url(#glass)" stroke="#27d8ff" stroke-opacity=".9" stroke-width="3"/><path d="M94 688H986" stroke="#d9f4ff" stroke-opacity=".22"/>
    <text x="540" y="786" fill="#eaf7ff" text-anchor="middle" font-family="Georgia,serif" font-size="40" font-weight="700">Blockchain Summit Latam Colombia 2026</text>
    <path d="M118 814H962" stroke="#27d8ff" stroke-opacity=".7" stroke-width="2"/>
    <g fill="none" stroke="#27d8ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="213.6" y="849.5" width="25.8" height="22.8" rx="5"/><path d="M213.6 857h25.8M221 845.6v6.9M233 845.6v6.9M641 876.8c-3-6-12-14.7-12-21.0a12 12 0 1 1 24 0c0 6.3-9 15-12 21z"/><circle cx="641" cy="855.5" r="3.6"/></g>
    <text x="255" y="870" fill="#f3f8ff" font-family="Arial,sans-serif" font-size="28" font-weight="700">${date}</text><text x="668" y="870" fill="#f3f8ff" font-family="Arial,sans-serif" font-size="27" font-weight="700">Bogotá, Colombia</text>
    <path d="M532 834V890M118 904H962" stroke="#27d8ff" stroke-opacity=".48" stroke-width="2"/><g transform="translate(292 943)" fill="none" stroke="#27d8ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M-14.4-3.9L0-13.2L14.4-3.9M-12-2.4H12M-12.9 11.1H12.9M-15 13.8H15M-10.2-1.2V9.9M-3.6-1.2V9.9M3.6-1.2V9.9M10.2-1.2V9.9"/></g>
    <text x="323" y="956" fill="#f3f8ff" font-family="Arial,sans-serif" font-size="27" font-weight="700">Universidad Externado · La Candelaria</text>
    <rect x="150" y="984" width="780" height="72" rx="36" fill="#081e46" fill-opacity=".8" stroke="#27d8ff" stroke-opacity=".7" stroke-width="2"/><text x="540" y="1031" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700">${identity}</text>
    ${socials}<text x="540" y="1161" fill="#27d8ff" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700">#BlockchainSummitLatam   #BSLOnTour2026   #BSLColombia2026</text>
    <text x="${poweredByLabelRight}" y="1270" fill="#e6f4ff" fill-opacity=".78" text-anchor="end" font-family="monospace" font-size="15">${poweredBy}</text><image href="${assets.hashpassLogo}" x="${hashpassLogoX}" y="1247" width="150" height="36" preserveAspectRatio="xMidYMid meet"/>
  </g><rect x="16" y="16" width="1048" height="1318" rx="48" fill="none" stroke="#27d8ff" stroke-opacity=".7" stroke-width="3"/>
  </svg>`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const sharedAssets = {
    background: dataUri(path.join(publicDir, 'backgrounds/bsl-colombia-2026.png'), 'image/png'),
    bslLogo: dataUri(path.join(publicDir, 'logos/bsl-ontour-pro.svg'), 'image/svg+xml'),
    hashpassLogo: dataUri(path.join(publicDir, 'logo-full-hashpass-white-cyan.svg'), 'image/svg+xml'),
  };
  for (const locale of ['es', 'en']) {
    const assets = { ...sharedAssets, attendee: dataUri(attendeePhotos[locale], 'image/png') };
    await sharp(Buffer.from(artwork(locale, assets)))
      .resize({ width: 840, height: 1050 })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(outputDir, `bsl-colombia-2026-attendance-${locale}.jpg`));
  }
  await sharp(path.join(publicDir, 'logo-full-hashpass-white-cyan.svg'))
    .resize({ width: 480 }).png().toFile(path.join(outputDir, 'hashpass-white-cyan.png'));
  await sharp(path.join(publicDir, 'logos/bsl-ontour-pro.svg'))
    .resize({ width: 320 }).png().toFile(path.join(outputDir, 'bsl-ontour-pro.png'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Could not render BSL email artwork.');
  process.exitCode = 1;
});
