import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const assetsRoot = path.join(appRoot, 'assets');
const outputRoot = path.join(assetsRoot, 'store', 'google-play');

const COLORS = {
  ink: '#05070C',
  navy: '#0B1420',
  slate: '#415166',
  cyan: '#33FFCC',
  cyanSoft: '#A8FFEC',
  red: '#D90818',
  white: '#FCFCFC',
  mist: '#F4F7F8',
  muted: '#AAB5C2',
};

const assetPaths = {
  logoWhite: path.join(assetsRoot, 'logos', 'hashpass', 'logo-full-hashpass-white-cyan.svg'),
  logoDark: path.join(assetsRoot, 'logos', 'hashpass', 'logo-full-hashpass-black-cyan.svg'),
  bslLogo: path.join(assetsRoot, 'logos', 'bsl', 'BSL-logo-blanco.png'),
  appIcon: path.join(assetsRoot, 'android-chrome-512x512.png'),
  qr: path.join(assetsRoot, 'images', 'qr-one-link-hashpass.png'),
  checkIn: path.join(outputRoot, 'source', 'conference-check-in.png'),
  networking: path.join(outputRoot, 'source', 'conference-networking.png'),
  ana: path.join(assetsRoot, 'speakers', 'avatars', 'foto-ana-garces.png'),
  camila: path.join(assetsRoot, 'speakers', 'avatars', 'foto-camila-ortegon.png'),
  edward: path.join(assetsRoot, 'speakers', 'avatars', 'foto-edward-calderon.png'),
};

const mimeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return 'image/png';
};

const toDataUri = async (filePath) => {
  const data = await fs.readFile(filePath);
  return `data:${mimeFor(filePath)};base64,${data.toString('base64')}`;
};

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const text = ({
  x,
  y,
  value,
  size,
  fill = COLORS.white,
  weight = 700,
  anchor = 'start',
  opacity = 1,
  spacing = 0,
  family = 'Noto Sans Display, Noto Sans, sans-serif',
}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;

const multiline = ({
  x,
  y,
  lines,
  size,
  lineHeight,
  fill = COLORS.white,
  weight = 800,
  anchor = 'start',
  spacing = 0,
}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Noto Sans Display, Noto Sans, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;

const image = ({
  href,
  x,
  y,
  width,
  height,
  fit = 'xMidYMid slice',
  opacity = 1,
  clip,
}) =>
  `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${fit}" opacity="${opacity}"${clip ? ` clip-path="url(#${clip})"` : ''}/>`;

const baseDefs = (prefix) => `
  <defs>
    <linearGradient id="${prefix}-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.98"/>
      <stop offset="0.52" stop-color="${COLORS.ink}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="${prefix}-vfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.2"/>
      <stop offset="0.55" stop-color="${COLORS.ink}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.98"/>
    </linearGradient>
    <radialGradient id="${prefix}-glow" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="${COLORS.cyan}" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="${COLORS.navy}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="1"/>
    </radialGradient>
    <filter id="${prefix}-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="20"/>
      <feOffset dy="18"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .48 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="${prefix}-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dy="8"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .28 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

const phoneUi = ({ type, width, height, ids, photo, qr, bslLogo, appIcon, avatars }) => {
  const scaleX = width / 540;
  const scaleY = height / 1100;
  const scale = Math.min(scaleX, scaleY);
  const uiWidth = width / scale;
  const uiHeight = height / scale;
  const sx = (n) => n;
  const sw = uiWidth;
  const sh = uiHeight;
  const bottomY = sh - 90;

  const header = `
    <rect width="${sw}" height="154" fill="${COLORS.ink}"/>
    <rect x="0" y="0" width="${sw}" height="5" fill="${COLORS.cyan}"/>
    ${text({ x: 34, y: 36, value: '9:41', size: 15, weight: 700 })}
    ${text({ x: sw - 36, y: 36, value: '●  ◒  ▰', size: 12, weight: 600, anchor: 'end', opacity: 0.82 })}
    ${image({ href: appIcon, x: 30, y: 65, width: 52, height: 52, fit: 'xMidYMid meet' })}
    ${text({ x: 98, y: 99, value: 'HASHPASS', size: 22, weight: 800, spacing: 2 })}
    <circle cx="${sw - 52}" cy="91" r="22" fill="#172331"/>
    ${text({ x: sw - 52, y: 99, value: 'E', size: 18, weight: 800, anchor: 'middle', fill: COLORS.cyan })}
  `;

  const bottomNav = `
    <rect x="0" y="${bottomY}" width="${sw}" height="90" fill="${COLORS.white}"/>
    <line x1="0" y1="${bottomY}" x2="${sw}" y2="${bottomY}" stroke="#DDE4E8"/>
    ${text({ x: 72, y: bottomY + 35, value: '⌂', size: 26, fill: COLORS.ink, anchor: 'middle' })}
    ${text({ x: 72, y: bottomY + 66, value: 'Explore', size: 12, fill: COLORS.ink, anchor: 'middle', weight: 700 })}
    ${text({ x: sw / 2, y: bottomY + 35, value: '▣', size: 24, fill: COLORS.slate, anchor: 'middle' })}
    ${text({ x: sw / 2, y: bottomY + 66, value: 'Wallet', size: 12, fill: COLORS.slate, anchor: 'middle', weight: 700 })}
    ${text({ x: sw - 72, y: bottomY + 35, value: '◎', size: 25, fill: COLORS.slate, anchor: 'middle' })}
    ${text({ x: sw - 72, y: bottomY + 66, value: 'Profile', size: 12, fill: COLORS.slate, anchor: 'middle', weight: 700 })}
  `;

  let content = '';

  if (type === 'events') {
    content = `
      <rect y="154" width="${sw}" height="${sh - 244}" fill="${COLORS.mist}"/>
      ${text({ x: 32, y: 205, value: 'Discover your next event', size: 27, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 32, y: 234, value: 'Everything you need, before and during the event.', size: 14, fill: COLORS.slate, weight: 500 })}
      <rect x="30" y="265" width="${sw - 60}" height="390" rx="30" fill="${COLORS.ink}" filter="url(#${ids}-ui-shadow)"/>
      <clipPath id="${ids}-event-photo"><rect x="30" y="265" width="${sw - 60}" height="218" rx="30"/></clipPath>
      ${image({ href: photo, x: 30, y: 265, width: sw - 60, height: 218, clip: `${ids}-event-photo` })}
      <rect x="30" y="265" width="${sw - 60}" height="218" rx="30" fill="url(#${ids}-event-fade)"/>
      ${image({ href: bslLogo, x: 62, y: 303, width: 235, height: 88, fit: 'xMinYMid meet' })}
      <rect x="62" y="429" width="132" height="34" rx="17" fill="${COLORS.cyan}"/>
      ${text({ x: 128, y: 452, value: 'FEATURED', size: 12, fill: COLORS.ink, weight: 900, anchor: 'middle', spacing: 1 })}
      ${text({ x: 62, y: 528, value: 'Blockchain Summit Latam', size: 25, weight: 800 })}
      ${text({ x: 62, y: 560, value: 'Connect, learn and build with the ecosystem.', size: 14, fill: COLORS.muted, weight: 500 })}
      <rect x="62" y="591" width="190" height="44" rx="22" fill="${COLORS.cyan}"/>
      ${text({ x: 157, y: 620, value: 'Open event', size: 15, fill: COLORS.ink, weight: 800, anchor: 'middle' })}
      ${text({ x: 32, y: 710, value: 'Quick access', size: 22, fill: COLORS.ink, weight: 800 })}
      <rect x="30" y="738" width="${(sw - 76) / 2}" height="156" rx="24" fill="${COLORS.white}" stroke="#E1E7EA"/>
      <rect x="${54 + (sw - 76) / 2}" y="738" width="${(sw - 76) / 2}" height="156" rx="24" fill="${COLORS.white}" stroke="#E1E7EA"/>
      <circle cx="80" cy="785" r="24" fill="${COLORS.cyan}"/>
      ${text({ x: 80, y: 794, value: '▣', size: 22, fill: COLORS.ink, anchor: 'middle' })}
      ${text({ x: 52, y: 842, value: 'My pass', size: 18, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 52, y: 867, value: 'Ready for entry', size: 13, fill: COLORS.slate, weight: 500 })}
      <circle cx="${104 + (sw - 76) / 2}" cy="785" r="24" fill="${COLORS.ink}"/>
      ${text({ x: 104 + (sw - 76) / 2, y: 794, value: '≡', size: 22, fill: COLORS.cyan, anchor: 'middle' })}
      ${text({ x: 76 + (sw - 76) / 2, y: 842, value: 'Agenda', size: 18, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 76 + (sw - 76) / 2, y: 867, value: 'Build your day', size: 13, fill: COLORS.slate, weight: 500 })}
    `;
  } else if (type === 'pass') {
    content = `
      <rect y="154" width="${sw}" height="${sh - 244}" fill="${COLORS.mist}"/>
      ${text({ x: 32, y: 207, value: 'Digital wallet', size: 28, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 32, y: 238, value: 'Secure event access in one place.', size: 14, fill: COLORS.slate, weight: 500 })}
      <rect x="30" y="269" width="${sw - 60}" height="195" rx="28" fill="${COLORS.ink}" filter="url(#${ids}-ui-shadow)"/>
      <circle cx="${sw - 82}" cy="320" r="72" fill="${COLORS.cyan}" opacity="0.14"/>
      <circle cx="${sw - 82}" cy="320" r="47" fill="none" stroke="${COLORS.cyan}" stroke-width="2" opacity="0.48"/>
      ${text({ x: 58, y: 315, value: 'EVENT PASS', size: 12, fill: COLORS.cyan, weight: 900, spacing: 2 })}
      ${text({ x: 58, y: 357, value: 'HashPass Member', size: 24, weight: 800 })}
      ${text({ x: 58, y: 396, value: 'HP-8F2A-019', size: 15, fill: COLORS.muted, weight: 600, spacing: 1 })}
      <rect x="58" y="418" width="95" height="28" rx="14" fill="${COLORS.cyan}"/>
      ${text({ x: 105, y: 438, value: 'ACTIVE', size: 11, fill: COLORS.ink, weight: 900, anchor: 'middle', spacing: 1 })}
      ${text({ x: 32, y: 518, value: 'Dynamic QR code', size: 22, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 32, y: 545, value: 'Present this code at event check-in.', size: 14, fill: COLORS.slate, weight: 500 })}
      <rect x="${sw / 2 - 171}" y="574" width="342" height="342" rx="28" fill="${COLORS.white}" stroke="#DDE5E8" stroke-width="2" filter="url(#${ids}-ui-shadow)"/>
      ${image({ href: qr, x: sw / 2 - 137, y: 608, width: 274, height: 274, fit: 'xMidYMid meet' })}
      <rect x="${sw / 2 - 110}" y="943" width="220" height="48" rx="24" fill="${COLORS.ink}"/>
      ${text({ x: sw / 2, y: 975, value: 'Refresh secure code', size: 15, fill: COLORS.white, weight: 800, anchor: 'middle' })}
    `;
  } else if (type === 'agenda') {
    const agendaItems = [
      ['09:00', 'Opening keynote', 'Main Stage'],
      ['10:30', 'Future of digital identity', 'Innovation Hall'],
      ['12:00', 'Web3 infrastructure at scale', 'Builders Stage'],
      ['14:15', 'Tokenization in Latin America', 'Main Stage'],
      ['16:00', 'Founder networking session', 'Community Lounge'],
    ];
    content = `
      <rect y="154" width="${sw}" height="${sh - 244}" fill="#080C12"/>
      ${text({ x: 32, y: 207, value: 'Your agenda', size: 28, weight: 800 })}
      ${text({ x: 32, y: 238, value: 'A clear plan for every conversation.', size: 14, fill: COLORS.muted, weight: 500 })}
      <rect x="30" y="270" width="${sw - 60}" height="58" rx="29" fill="#131D27"/>
      <rect x="36" y="276" width="140" height="46" rx="23" fill="${COLORS.cyan}"/>
      ${text({ x: 106, y: 306, value: 'TODAY', size: 13, fill: COLORS.ink, anchor: 'middle', weight: 900, spacing: 1 })}
      ${text({ x: 242, y: 306, value: 'TOMORROW', size: 13, fill: COLORS.muted, anchor: 'middle', weight: 800, spacing: 1 })}
      ${agendaItems.map((item, index) => {
        const y = 364 + index * 127;
        return `
          <rect x="30" y="${y}" width="${sw - 60}" height="108" rx="22" fill="${index === 1 ? '#122A29' : '#111923'}" stroke="${index === 1 ? COLORS.cyan : '#1C2834'}" stroke-width="${index === 1 ? 2 : 1}"/>
          ${text({ x: 54, y: y + 34, value: item[0], size: 14, fill: index === 1 ? COLORS.cyan : COLORS.muted, weight: 800 })}
          ${text({ x: 54, y: y + 66, value: item[1], size: 18, weight: 800 })}
          ${text({ x: 54, y: y + 91, value: item[2], size: 13, fill: COLORS.muted, weight: 500 })}
          <circle cx="${sw - 64}" cy="${y + 54}" r="20" fill="${index === 1 ? COLORS.cyan : '#1D2935'}"/>
          ${text({ x: sw - 64, y: y + 62, value: index === 1 ? '✓' : '+', size: 20, fill: index === 1 ? COLORS.ink : COLORS.white, anchor: 'middle', weight: 800 })}
        `;
      }).join('')}
    `;
  } else {
    content = `
      <rect y="154" width="${sw}" height="${sh - 244}" fill="${COLORS.mist}"/>
      ${text({ x: 32, y: 207, value: 'Event networking', size: 28, fill: COLORS.ink, weight: 800 })}
      ${text({ x: 32, y: 238, value: 'Turn the right introduction into a meeting.', size: 14, fill: COLORS.slate, weight: 500 })}
      <rect x="30" y="270" width="${sw - 60}" height="54" rx="27" fill="${COLORS.white}" stroke="#DCE4E8"/>
      ${text({ x: 58, y: 304, value: '⌕  Search attendees and speakers', size: 14, fill: COLORS.slate, weight: 500 })}
      <clipPath id="${ids}-network-photo"><rect x="30" y="353" width="${sw - 60}" height="292" rx="30"/></clipPath>
      ${image({ href: photo, x: 30, y: 353, width: sw - 60, height: 292, clip: `${ids}-network-photo` })}
      <rect x="30" y="353" width="${sw - 60}" height="292" rx="30" fill="url(#${ids}-network-fade)"/>
      ${text({ x: 58, y: 564, value: 'Make every event connection count.', size: 22, weight: 800 })}
      ${text({ x: 58, y: 596, value: 'Discover people with shared interests.', size: 14, fill: COLORS.cyanSoft, weight: 600 })}
      <rect x="58" y="613" width="148" height="40" rx="20" fill="${COLORS.cyan}"/>
      ${text({ x: 132, y: 640, value: 'Find people', size: 14, fill: COLORS.ink, weight: 800, anchor: 'middle' })}
      ${text({ x: 32, y: 705, value: 'Suggested connections', size: 21, fill: COLORS.ink, weight: 800 })}
      ${[
        [avatars.ana, 'Ana Garces', 'Digital identity'],
        [avatars.camila, 'Camila Ortegon', 'Community & growth'],
        [avatars.edward, 'Edward Calderon', 'Event technology'],
      ].map((person, index) => {
        const y = 738 + index * 112;
        return `
          <rect x="30" y="${y}" width="${sw - 60}" height="94" rx="22" fill="${COLORS.white}" stroke="#E0E6E9"/>
          <clipPath id="${ids}-avatar-${index}"><circle cx="78" cy="${y + 47}" r="31"/></clipPath>
          ${image({ href: person[0], x: 47, y: y + 16, width: 62, height: 62, clip: `${ids}-avatar-${index}` })}
          ${text({ x: 128, y: y + 41, value: person[1], size: 17, fill: COLORS.ink, weight: 800 })}
          ${text({ x: 128, y: y + 65, value: person[2], size: 13, fill: COLORS.slate, weight: 500 })}
          <rect x="${sw - 112}" y="${y + 28}" width="64" height="38" rx="19" fill="${COLORS.ink}"/>
          ${text({ x: sw - 80, y: y + 54, value: '+', size: 20, fill: COLORS.cyan, anchor: 'middle', weight: 800 })}
        `;
      }).join('')}
    `;
  }

  return `
    <g transform="scale(${scale})">
      <defs>
        <linearGradient id="${ids}-event-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.05"/>
          <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.84"/>
        </linearGradient>
        <linearGradient id="${ids}-network-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0"/>
          <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.9"/>
        </linearGradient>
        <filter id="${ids}-ui-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="7"/>
          <feOffset dy="6"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .16 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${header}
      ${content}
      ${bottomNav}
    </g>
  `;
};

const phoneFrame = ({ x, y, width, height, type, ids, resources, rotate = 0 }) => {
  const inset = Math.round(width * 0.035);
  const innerX = x + inset;
  const innerY = y + inset;
  const innerWidth = width - inset * 2;
  const innerHeight = height - inset * 2;
  const radius = Math.round(width * 0.105);
  const innerRadius = Math.round(width * 0.085);

  return `
    <g transform="rotate(${rotate} ${x + width / 2} ${y + height / 2})" filter="url(#${ids}-shadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#020304" stroke="#32404E" stroke-width="${Math.max(4, width * 0.008)}"/>
      <clipPath id="${ids}-screen"><rect x="0" y="0" width="${innerWidth}" height="${innerHeight}" rx="${innerRadius}"/></clipPath>
      <g transform="translate(${innerX} ${innerY})" clip-path="url(#${ids}-screen)">
        ${phoneUi({
          type,
          width: innerWidth,
          height: innerHeight,
          ids,
          photo: type === 'network' ? resources.networking : resources.checkIn,
          qr: resources.qr,
          bslLogo: resources.bslLogo,
          appIcon: resources.appIcon,
          avatars: resources.avatars,
        })}
      </g>
      <rect x="${x + width * 0.36}" y="${y + inset * 0.45}" width="${width * 0.28}" height="${Math.max(10, height * 0.008)}" rx="8" fill="#090D12"/>
    </g>
  `;
};

const phonePoster = ({ id, title, subtitle, type, photo, resources, output }) => {
  const width = 1440;
  const height = 2560;
  const usePhoto = type === 'network' || type === 'events';
  const photoHref = photo || resources.networking;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${baseDefs(id)}
      <rect width="${width}" height="${height}" fill="${COLORS.ink}"/>
      ${usePhoto ? image({ href: photoHref, x: 0, y: 0, width, height }) : ''}
      ${usePhoto ? `<rect width="${width}" height="${height}" fill="url(#${id}-vfade)"/>` : `<rect width="${width}" height="${height}" fill="url(#${id}-glow)"/>`}
      <circle cx="1200" cy="300" r="360" fill="none" stroke="${COLORS.cyan}" stroke-width="2" opacity="0.16"/>
      <circle cx="1200" cy="300" r="270" fill="none" stroke="${COLORS.cyan}" stroke-width="2" opacity="0.10"/>
      <rect x="92" y="94" width="174" height="48" rx="24" fill="${COLORS.cyan}"/>
      ${text({ x: 179, y: 126, value: 'HASHPASS', size: 16, fill: COLORS.ink, weight: 900, anchor: 'middle', spacing: 2 })}
      ${multiline({ x: 92, y: 250, lines: title, size: 82, lineHeight: 91, weight: 900, spacing: -2 })}
      ${multiline({ x: 96, y: 455, lines: subtitle, size: 30, lineHeight: 42, fill: '#DAE2E8', weight: 500 })}
      ${phoneFrame({ x: 250, y: 700, width: 940, height: 1800, type, ids: `${id}-phone`, resources })}
    </svg>`;
  return renderSvg(svg, output);
};

const browserShell = ({ id, x, y, width, height, mode, resources }) => {
  const sidebarWidth = width * 0.21;
  const contentX = x + sidebarWidth;
  const headerHeight = 94;
  const panelTop = y + headerHeight;
  const panelHeight = height - headerHeight;
  const cardY = panelTop + 116;
  const photoWidth = (width - sidebarWidth) * 0.47;

  const agendaRows = [
    ['09:00', 'Opening keynote', 'Main Stage'],
    ['10:30', 'Future of digital identity', 'Innovation Hall'],
    ['12:00', 'Web3 infrastructure at scale', 'Builders Stage'],
    ['14:15', 'Tokenization in Latin America', 'Main Stage'],
  ];

  const eventDashboard = `
    ${text({ x: contentX + 66, y: panelTop + 72, value: 'Good morning, Edward', size: 34, fill: COLORS.ink, weight: 850 })}
    ${text({ x: contentX + 66, y: panelTop + 110, value: 'Your event experience is ready.', size: 18, fill: COLORS.slate, weight: 500 })}
    <clipPath id="${id}-hero-card"><rect x="${contentX + 66}" y="${cardY}" width="${photoWidth}" height="${panelHeight - 200}" rx="34"/></clipPath>
    ${image({ href: resources.checkIn, x: contentX + 66, y: cardY, width: photoWidth, height: panelHeight - 200, clip: `${id}-hero-card` })}
    <rect x="${contentX + 66}" y="${cardY}" width="${photoWidth}" height="${panelHeight - 200}" rx="34" fill="url(#${id}-card-fade)"/>
    ${image({ href: resources.bslLogo, x: contentX + 108, y: cardY + 54, width: photoWidth * 0.58, height: 120, fit: 'xMinYMid meet' })}
    ${text({ x: contentX + 108, y: cardY + panelHeight - 348, value: 'YOUR NEXT EVENT', size: 15, fill: COLORS.cyan, weight: 900, spacing: 2 })}
    ${multiline({ x: contentX + 108, y: cardY + panelHeight - 286, lines: ['Connect to the', 'blockchain ecosystem.'], size: 42, lineHeight: 49, weight: 850 })}
    <rect x="${contentX + 108}" y="${cardY + panelHeight - 162}" width="218" height="54" rx="27" fill="${COLORS.cyan}"/>
    ${text({ x: contentX + 217, y: cardY + panelHeight - 126, value: 'Open event', size: 17, fill: COLORS.ink, weight: 850, anchor: 'middle' })}
    <rect x="${contentX + 66 + photoWidth + 36}" y="${cardY}" width="${width - sidebarWidth - photoWidth - 204}" height="${(panelHeight - 234) / 2}" rx="30" fill="${COLORS.white}" stroke="#E0E7EA"/>
    ${text({ x: contentX + 112 + photoWidth, y: cardY + 62, value: 'Your digital pass', size: 25, fill: COLORS.ink, weight: 850 })}
    ${text({ x: contentX + 112 + photoWidth, y: cardY + 96, value: 'Verified and ready for check-in', size: 16, fill: COLORS.slate, weight: 500 })}
    <rect x="${contentX + 112 + photoWidth}" y="${cardY + 130}" width="246" height="116" rx="24" fill="${COLORS.ink}"/>
    ${text({ x: contentX + 140 + photoWidth, y: cardY + 170, value: 'EVENT PASS', size: 11, fill: COLORS.cyan, weight: 900, spacing: 2 })}
    ${text({ x: contentX + 140 + photoWidth, y: cardY + 208, value: 'HP-8F2A-019', size: 19, fill: COLORS.white, weight: 800 })}
    <rect x="${contentX + 66 + photoWidth + 36}" y="${cardY + (panelHeight - 234) / 2 + 30}" width="${width - sidebarWidth - photoWidth - 204}" height="${(panelHeight - 234) / 2}" rx="30" fill="${COLORS.ink}"/>
    ${text({ x: contentX + 112 + photoWidth, y: cardY + (panelHeight - 234) / 2 + 92, value: 'Next on your agenda', size: 24, weight: 850 })}
    ${text({ x: contentX + 112 + photoWidth, y: cardY + (panelHeight - 234) / 2 + 130, value: '10:30  Future of digital identity', size: 17, fill: COLORS.cyanSoft, weight: 650 })}
    ${text({ x: contentX + 112 + photoWidth, y: cardY + (panelHeight - 234) / 2 + 166, value: 'Innovation Hall', size: 15, fill: COLORS.muted, weight: 500 })}
  `;

  const passDashboard = `
    ${text({ x: contentX + 66, y: panelTop + 72, value: 'Secure ticket wallet', size: 34, fill: COLORS.ink, weight: 850 })}
    ${text({ x: contentX + 66, y: panelTop + 110, value: 'One verified pass for every event experience.', size: 18, fill: COLORS.slate, weight: 500 })}
    <rect x="${contentX + 66}" y="${cardY}" width="${(width - sidebarWidth) * 0.44}" height="${panelHeight - 200}" rx="34" fill="${COLORS.ink}"/>
    <circle cx="${contentX + 66 + (width - sidebarWidth) * 0.36}" cy="${cardY + 110}" r="120" fill="${COLORS.cyan}" opacity="0.12"/>
    ${text({ x: contentX + 112, y: cardY + 74, value: 'EVENT PASS', size: 14, fill: COLORS.cyan, weight: 900, spacing: 2 })}
    ${text({ x: contentX + 112, y: cardY + 132, value: 'HashPass Member', size: 34, weight: 850 })}
    ${text({ x: contentX + 112, y: cardY + 177, value: 'HP-8F2A-019', size: 18, fill: COLORS.muted, weight: 650, spacing: 1 })}
    <rect x="${contentX + 112}" y="${cardY + 215}" width="110" height="34" rx="17" fill="${COLORS.cyan}"/>
    ${text({ x: contentX + 167, y: cardY + 238, value: 'ACTIVE', size: 12, fill: COLORS.ink, anchor: 'middle', weight: 900, spacing: 1 })}
    ${text({ x: contentX + 112, y: cardY + 326, value: 'Dynamic entry code', size: 22, weight: 800 })}
    <rect x="${contentX + 112}" y="${cardY + 365}" width="330" height="330" rx="26" fill="${COLORS.white}"/>
    ${image({ href: resources.qr, x: contentX + 144, y: cardY + 397, width: 266, height: 266, fit: 'xMidYMid meet' })}
    <rect x="${contentX + 66 + (width - sidebarWidth) * 0.44 + 38}" y="${cardY}" width="${width - sidebarWidth - (width - sidebarWidth) * 0.44 - 204}" height="${panelHeight - 200}" rx="34" fill="${COLORS.white}" stroke="#E0E7EA"/>
    ${text({ x: contentX + 150 + (width - sidebarWidth) * 0.44, y: cardY + 76, value: 'Why it is secure', size: 28, fill: COLORS.ink, weight: 850 })}
    ${[
      ['01', 'Verified ownership', 'Your pass is linked to your authenticated HashPass account.'],
      ['02', 'Rotating QR code', 'The entry code refreshes automatically to prevent reuse.'],
      ['03', 'Fast event entry', 'Open the pass and check in without searching through email.'],
    ].map((item, index) => {
      const rowY = cardY + 135 + index * 170;
      return `
        <circle cx="${contentX + 175 + (width - sidebarWidth) * 0.44}" cy="${rowY + 33}" r="30" fill="${index === 1 ? COLORS.cyan : '#EAF0F2'}"/>
        ${text({ x: contentX + 175 + (width - sidebarWidth) * 0.44, y: rowY + 41, value: item[0], size: 14, fill: COLORS.ink, anchor: 'middle', weight: 900 })}
        ${text({ x: contentX + 226 + (width - sidebarWidth) * 0.44, y: rowY + 22, value: item[1], size: 20, fill: COLORS.ink, weight: 850 })}
        ${multiline({ x: contentX + 226 + (width - sidebarWidth) * 0.44, y: rowY + 52, lines: [item[2]], size: 14, lineHeight: 21, fill: COLORS.slate, weight: 500 })}
      `;
    }).join('')}
  `;

  const agendaDashboard = `
    ${text({ x: contentX + 66, y: panelTop + 72, value: 'Build your event day', size: 34, fill: COLORS.ink, weight: 850 })}
    ${text({ x: contentX + 66, y: panelTop + 110, value: 'Sessions, speakers and meetings in one clear timeline.', size: 18, fill: COLORS.slate, weight: 500 })}
    <rect x="${contentX + 66}" y="${cardY}" width="${width - sidebarWidth - 132}" height="${panelHeight - 200}" rx="34" fill="${COLORS.white}" stroke="#E0E7EA"/>
    <rect x="${contentX + 102}" y="${cardY + 34}" width="360" height="56" rx="28" fill="#EEF3F4"/>
    <rect x="${contentX + 108}" y="${cardY + 40}" width="148" height="44" rx="22" fill="${COLORS.ink}"/>
    ${text({ x: contentX + 182, y: cardY + 69, value: 'TODAY', size: 13, fill: COLORS.cyan, anchor: 'middle', weight: 900, spacing: 1 })}
    ${text({ x: contentX + 350, y: cardY + 69, value: 'TOMORROW', size: 13, fill: COLORS.slate, anchor: 'middle', weight: 800, spacing: 1 })}
    ${agendaRows.map((item, index) => {
      const rowY = cardY + 125 + index * 136;
      return `
        <rect x="${contentX + 102}" y="${rowY}" width="${width - sidebarWidth - 204}" height="110" rx="24" fill="${index === 1 ? '#E9FFF9' : COLORS.mist}" stroke="${index === 1 ? COLORS.cyan : '#E1E7EA'}" stroke-width="${index === 1 ? 2 : 1}"/>
        ${text({ x: contentX + 136, y: rowY + 45, value: item[0], size: 18, fill: index === 1 ? '#047A62' : COLORS.slate, weight: 850 })}
        ${text({ x: contentX + 260, y: rowY + 42, value: item[1], size: 22, fill: COLORS.ink, weight: 850 })}
        ${text({ x: contentX + 260, y: rowY + 76, value: item[2], size: 15, fill: COLORS.slate, weight: 500 })}
        <circle cx="${x + width - 148}" cy="${rowY + 55}" r="24" fill="${index === 1 ? COLORS.cyan : COLORS.white}"/>
        ${text({ x: x + width - 148, y: rowY + 64, value: index === 1 ? '✓' : '+', size: 22, fill: COLORS.ink, anchor: 'middle', weight: 850 })}
      `;
    }).join('')}
  `;

  const networkDashboard = `
    ${text({ x: contentX + 66, y: panelTop + 72, value: 'Connect with purpose', size: 34, fill: COLORS.ink, weight: 850 })}
    ${text({ x: contentX + 66, y: panelTop + 110, value: 'Find relevant people and turn introductions into meetings.', size: 18, fill: COLORS.slate, weight: 500 })}
    <clipPath id="${id}-network-banner"><rect x="${contentX + 66}" y="${cardY}" width="${width - sidebarWidth - 132}" height="275" rx="34"/></clipPath>
    ${image({ href: resources.networking, x: contentX + 66, y: cardY, width: width - sidebarWidth - 132, height: 275, clip: `${id}-network-banner` })}
    <rect x="${contentX + 66}" y="${cardY}" width="${width - sidebarWidth - 132}" height="275" rx="34" fill="url(#${id}-network-card-fade)"/>
    ${text({ x: contentX + 112, y: cardY + 176, value: 'Your next valuable conversation starts here.', size: 34, weight: 850 })}
    ${text({ x: contentX + 112, y: cardY + 218, value: 'Explore attendees, speakers and shared interests.', size: 18, fill: COLORS.cyanSoft, weight: 600 })}
    ${[
      [resources.avatars.ana, 'Ana Garces', 'Digital identity'],
      [resources.avatars.camila, 'Camila Ortegon', 'Community & growth'],
      [resources.avatars.edward, 'Edward Calderon', 'Event technology'],
    ].map((person, index) => {
      const cardWidth = (width - sidebarWidth - 204) / 3;
      const cardX = contentX + 66 + index * (cardWidth + 36);
      const cardTop = cardY + 315;
      return `
        <rect x="${cardX}" y="${cardTop}" width="${cardWidth}" height="${panelHeight - 515}" rx="30" fill="${COLORS.white}" stroke="#E0E7EA"/>
        <clipPath id="${id}-person-${index}"><circle cx="${cardX + cardWidth / 2}" cy="${cardTop + 100}" r="60"/></clipPath>
        ${image({ href: person[0], x: cardX + cardWidth / 2 - 60, y: cardTop + 40, width: 120, height: 120, clip: `${id}-person-${index}` })}
        ${text({ x: cardX + cardWidth / 2, y: cardTop + 198, value: person[1], size: 21, fill: COLORS.ink, anchor: 'middle', weight: 850 })}
        ${text({ x: cardX + cardWidth / 2, y: cardTop + 230, value: person[2], size: 14, fill: COLORS.slate, anchor: 'middle', weight: 500 })}
        <rect x="${cardX + cardWidth / 2 - 76}" y="${cardTop + 268}" width="152" height="46" rx="23" fill="${index === 1 ? COLORS.cyan : COLORS.ink}"/>
        ${text({ x: cardX + cardWidth / 2, y: cardTop + 299, value: 'Connect', size: 15, fill: index === 1 ? COLORS.ink : COLORS.white, anchor: 'middle', weight: 850 })}
      `;
    }).join('')}
  `;

  const mainContent =
    mode === 'pass'
      ? passDashboard
      : mode === 'agenda'
        ? agendaDashboard
        : mode === 'network'
          ? networkDashboard
          : eventDashboard;

  return `
    <defs>
      <linearGradient id="${id}-card-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.06"/>
        <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.94"/>
      </linearGradient>
      <linearGradient id="${id}-network-card-fade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${COLORS.ink}" stop-opacity="0.88"/>
        <stop offset="0.7" stop-color="${COLORS.ink}" stop-opacity="0.2"/>
        <stop offset="1" stop-color="${COLORS.ink}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <g filter="url(#${id}-soft-shadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="34" fill="${COLORS.white}"/>
      <rect x="${x}" y="${y}" width="${width}" height="${headerHeight}" rx="34" fill="#EEF2F4"/>
      <rect x="${x}" y="${y + headerHeight - 34}" width="${width}" height="34" fill="#EEF2F4"/>
      <circle cx="${x + 38}" cy="${y + 47}" r="8" fill="#FF5C57"/>
      <circle cx="${x + 64}" cy="${y + 47}" r="8" fill="#FEBC2E"/>
      <circle cx="${x + 90}" cy="${y + 47}" r="8" fill="#28C840"/>
      <rect x="${x + 150}" y="${y + 25}" width="${width - 300}" height="44" rx="22" fill="${COLORS.white}"/>
      ${text({ x: x + width / 2, y: y + 54, value: 'app.hashpass.tech', size: 15, fill: COLORS.slate, anchor: 'middle', weight: 600 })}
      <rect x="${x}" y="${panelTop}" width="${sidebarWidth}" height="${panelHeight}" fill="${COLORS.ink}"/>
      ${image({ href: resources.logoWhite, x: x + 46, y: panelTop + 40, width: sidebarWidth - 92, height: 62, fit: 'xMinYMid meet' })}
      ${[
        ['Explore', 'events'],
        ['Wallet', 'pass'],
        ['Agenda', 'agenda'],
        ['Networking', 'network'],
      ].map((item, index) => {
        const itemY = panelTop + 145 + index * 72;
        const active = item[1] === mode || (mode === 'events' && index === 0);
        return `
          <rect x="${x + 28}" y="${itemY}" width="${sidebarWidth - 56}" height="54" rx="16" fill="${active ? '#17282B' : 'transparent'}"/>
          <circle cx="${x + 60}" cy="${itemY + 27}" r="13" fill="${active ? COLORS.cyan : '#293747'}"/>
          ${text({ x: x + 91, y: itemY + 34, value: item[0], size: 17, fill: active ? COLORS.white : COLORS.muted, weight: active ? 800 : 600 })}
        `;
      }).join('')}
      <rect x="${contentX}" y="${panelTop}" width="${width - sidebarWidth}" height="${panelHeight}" fill="${COLORS.mist}"/>
      ${mainContent}
    </g>
  `;
};

const landscapePoster = ({ id, eyebrow, title, subtitle, mode, resources, output, photoBackground = false }) => {
  const width = 2560;
  const height = 1440;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${baseDefs(id)}
      <rect width="${width}" height="${height}" fill="${COLORS.ink}"/>
      ${photoBackground ? image({ href: resources.checkIn, x: 0, y: 0, width, height }) : ''}
      ${photoBackground ? `<rect width="${width}" height="${height}" fill="url(#${id}-fade)"/>` : `<rect width="${width}" height="${height}" fill="url(#${id}-glow)"/>`}
      <circle cx="150" cy="1250" r="430" fill="none" stroke="${COLORS.cyan}" stroke-width="2" opacity="0.16"/>
      <rect x="100" y="92" width="180" height="46" rx="23" fill="${COLORS.cyan}"/>
      ${text({ x: 190, y: 123, value: eyebrow, size: 15, fill: COLORS.ink, weight: 900, anchor: 'middle', spacing: 2 })}
      ${multiline({ x: 100, y: 235, lines: title, size: 66, lineHeight: 76, weight: 900, spacing: -1.5 })}
      ${multiline({ x: 104, y: 420, lines: subtitle, size: 25, lineHeight: 36, fill: '#DCE5E9', weight: 500 })}
      ${browserShell({ id: `${id}-browser`, x: 650, y: 88, width: 1810, height: 1260, mode, resources })}
    </svg>`;
  return renderSvg(svg, output);
};

const featureGraphic = ({ resources, output }) => {
  const width = 1024;
  const height = 500;
  const id = 'feature';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${baseDefs(id)}
      <rect width="${width}" height="${height}" fill="${COLORS.ink}"/>
      ${image({ href: resources.checkIn, x: 0, y: 0, width, height })}
      <rect width="${width}" height="${height}" fill="url(#${id}-fade)"/>
      <circle cx="900" cy="70" r="160" fill="none" stroke="${COLORS.cyan}" stroke-width="1.5" opacity="0.25"/>
      ${image({ href: resources.logoWhite, x: 56, y: 74, width: 430, height: 90, fit: 'xMinYMid meet' })}
      ${multiline({ x: 58, y: 228, lines: ['Your event.', 'Your community.', 'Your benefits.'], size: 35, lineHeight: 43, weight: 850, spacing: -0.6 })}
      <rect x="58" y="386" width="388" height="42" rx="21" fill="${COLORS.cyan}"/>
      ${text({ x: 252, y: 414, value: 'EVENTS  •  PASSES  •  NETWORKING', size: 14, fill: COLORS.ink, weight: 900, anchor: 'middle', spacing: 1.2 })}
      ${phoneFrame({ x: 760, y: 36, width: 220, height: 440, type: 'pass', ids: 'feature-phone', resources, rotate: 2 })}
    </svg>`;
  return renderSvg(svg, output);
};

async function renderSvg(svg, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function main() {
  const resources = {
    logoWhite: await toDataUri(assetPaths.logoWhite),
    logoDark: await toDataUri(assetPaths.logoDark),
    bslLogo: await toDataUri(assetPaths.bslLogo),
    appIcon: await toDataUri(assetPaths.appIcon),
    qr: await toDataUri(assetPaths.qr),
    checkIn: await toDataUri(assetPaths.checkIn),
    networking: await toDataUri(assetPaths.networking),
    avatars: {
      ana: await toDataUri(assetPaths.ana),
      camila: await toDataUri(assetPaths.camila),
      edward: await toDataUri(assetPaths.edward),
    },
  };

  await featureGraphic({
    resources,
    output: path.join(outputRoot, 'feature-graphic-1024x500.png'),
  });

  const phoneAssets = [
    {
      id: 'phone-events',
      title: ['Every event.', 'One powerful pass.'],
      subtitle: ['Discover event experiences and open', 'everything you need from one place.'],
      type: 'events',
      photo: resources.networking,
      output: path.join(outputRoot, 'phone', '01-event-discovery-1440x2560.png'),
    },
    {
      id: 'phone-pass',
      title: ['Your ticket.', 'Verified.'],
      subtitle: ['A secure digital pass and rotating QR code', 'built for fast, confident event entry.'],
      type: 'pass',
      output: path.join(outputRoot, 'phone', '02-secure-digital-pass-1440x2560.png'),
    },
    {
      id: 'phone-agenda',
      title: ['Plan every', 'important moment.'],
      subtitle: ['Build your agenda and keep sessions,', 'stages and meetings organized.'],
      type: 'agenda',
      output: path.join(outputRoot, 'phone', '03-personal-agenda-1440x2560.png'),
    },
    {
      id: 'phone-network',
      title: ['Meet the people', 'who matter.'],
      subtitle: ['Discover relevant attendees and turn', 'event introductions into real meetings.'],
      type: 'network',
      photo: resources.networking,
      output: path.join(outputRoot, 'phone', '04-event-networking-1440x2560.png'),
    },
  ];

  for (const asset of phoneAssets) {
    await phonePoster({ ...asset, resources });
  }

  await phonePoster({
    id: 'tablet7-events',
    title: ['Explore the full', 'event experience.'],
    subtitle: ['Events, passes, agenda and community', 'designed to move with you.'],
    type: 'events',
    photo: resources.checkIn,
    resources,
    output: path.join(outputRoot, 'tablet-7', '01-event-experience-1440x2560.png'),
  });

  await phonePoster({
    id: 'tablet7-pass',
    title: ['Check in with', 'confidence.'],
    subtitle: ['Secure access, a verified pass and a', 'dynamic QR code in one clean wallet.'],
    type: 'pass',
    resources,
    output: path.join(outputRoot, 'tablet-7', '02-check-in-wallet-1440x2560.png'),
  });

  await landscapePoster({
    id: 'tablet10-events',
    eyebrow: 'HASHPASS',
    title: ['Your event', 'command center.'],
    subtitle: ['Discover experiences, access your pass,', 'and see what is next at a glance.'],
    mode: 'events',
    resources,
    output: path.join(outputRoot, 'tablet-10', '01-event-command-center-2560x1440.png'),
  });

  await landscapePoster({
    id: 'tablet10-agenda',
    eyebrow: 'PERSONAL AGENDA',
    title: ['A better plan', 'for every event.'],
    subtitle: ['Keep sessions, stages and meetings', 'organized in one focused timeline.'],
    mode: 'agenda',
    resources,
    output: path.join(outputRoot, 'tablet-10', '02-agenda-2560x1440.png'),
  });

  const chromebookAssets = [
    {
      id: 'chrome-platform',
      eyebrow: 'HASHPASS',
      title: ['The operating system', 'for your event life.'],
      subtitle: ['Events, passes, agenda and networking', 'connected in one premium experience.'],
      mode: 'events',
      photoBackground: true,
      output: path.join(outputRoot, 'chromebook', '01-event-platform-2560x1440.png'),
    },
    {
      id: 'chrome-events',
      eyebrow: 'DISCOVER',
      title: ['Find your next', 'great event.'],
      subtitle: ['Explore curated experiences and open', 'everything you need in one place.'],
      mode: 'events',
      output: path.join(outputRoot, 'chromebook', '02-event-discovery-2560x1440.png'),
    },
    {
      id: 'chrome-pass',
      eyebrow: 'SECURE ACCESS',
      title: ['Your verified pass,', 'always ready.'],
      subtitle: ['Fast check-in with authenticated ownership', 'and a rotating dynamic QR code.'],
      mode: 'pass',
      output: path.join(outputRoot, 'chromebook', '03-secure-pass-2560x1440.png'),
    },
    {
      id: 'chrome-network',
      eyebrow: 'NETWORKING',
      title: ['Turn attendance', 'into opportunity.'],
      subtitle: ['Find relevant people and move from', 'introduction to meeting with less friction.'],
      mode: 'network',
      output: path.join(outputRoot, 'chromebook', '04-networking-2560x1440.png'),
    },
  ];

  for (const asset of chromebookAssets) {
    await landscapePoster({ ...asset, resources });
  }

  console.log(`Generated Google Play assets in ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
