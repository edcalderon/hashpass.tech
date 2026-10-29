import type { AttendingArtworkOptions } from '../app/attending/types/attending.types';

const ART_WIDTH = 1080;
const ART_HEIGHT = 1350;
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const canvasRenderIds = new WeakMap<HTMLCanvasElement, number>();

function colorWithAlpha(color: string, alpha: number): string {
  const match = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return `rgba(14, 116, 144, ${alpha})`;
  const hex = match[1].length === 3
    ? match[1].split('').map((part) => `${part}${part}`).join('')
    : match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function loadImage(source: string | null): Promise<HTMLImageElement | null> {
  if (!source) return Promise.resolve(null);
  const cacheable = !source.startsWith('blob:');
  const cached = cacheable ? imageCache.get(source) : undefined;
  if (cached) return cached;

  const imagePromise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (source.startsWith('http://') || source.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (cacheable) imageCache.delete(source);
      resolve(null);
    };
    image.src = source;
  });
  if (cacheable) imageCache.set(source, imagePromise);
  return imagePromise;
}

function drawRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length) {
    let lastLine = visibleLines[visibleLines.length - 1];
    while (lastLine.length && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    visibleLines[visibleLines.length - 1] = `${lastLine}…`;
  }

  visibleLines.forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
  return y + visibleLines.length * lineHeight;
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawPortrait(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  name: string,
  accentColor: string,
  secondaryAccentColor: string,
) {
  const x = 548;
  const y = 78;
  const width = 470;
  const height = 785;
  const radius = 196;

  context.save();
  context.shadowColor = colorWithAlpha(accentColor, 0.55);
  context.shadowBlur = 35;
  drawRoundRect(context, x, y, width, height, radius);
  context.fillStyle = 'rgba(1, 12, 42, 0.9)';
  context.fill();
  context.shadowBlur = 0;

  drawRoundRect(context, x, y, width, height, radius);
  context.clip();
  const background = context.createLinearGradient(x, y, x + width, y + height);
  background.addColorStop(0, colorWithAlpha(accentColor, 0.85));
  background.addColorStop(1, colorWithAlpha(secondaryAccentColor, 0.7));
  context.fillStyle = background;
  context.fillRect(x, y, width, height);

  if (image) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || '★';
    context.fillStyle = '#ffffff';
    context.font = '800 112px Manrope, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(initials, x + width / 2, y + height / 2);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
  }
  context.restore();

  drawRoundRect(context, x, y, width, height, radius);
  context.strokeStyle = colorWithAlpha(accentColor, 0.88);
  context.lineWidth = 3;
  context.stroke();
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawLocationPin(context: CanvasRenderingContext2D, x: number, y: number, color: string, size = 38) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(x, y + size * 0.46);
  context.bezierCurveTo(x - size * 0.1, y + size * 0.26, x - size * 0.4, y - size * 0.03, x - size * 0.4, y - size * 0.24);
  context.arc(x, y - size * 0.24, size * 0.4, Math.PI, 0);
  context.bezierCurveTo(x + size * 0.4, y - size * 0.03, x + size * 0.1, y + size * 0.26, x, y + size * 0.46);
  context.stroke();
  context.beginPath();
  context.arc(x, y - size * 0.25, size * 0.12, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawCalendar(context: CanvasRenderingContext2D, x: number, y: number, color: string, size = 38) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  drawRoundRect(context, x - size * 0.43, y - size * 0.35, size * 0.86, size * 0.76, 5);
  context.stroke();
  context.beginPath();
  context.moveTo(x - size * 0.43, y - size * 0.1);
  context.lineTo(x + size * 0.43, y - size * 0.1);
  context.moveTo(x - size * 0.2, y - size * 0.48);
  context.lineTo(x - size * 0.2, y - size * 0.25);
  context.moveTo(x + size * 0.2, y - size * 0.48);
  context.lineTo(x + size * 0.2, y - size * 0.25);
  context.stroke();
  context.restore();
}

function drawBuilding(context: CanvasRenderingContext2D, x: number, y: number, color: string, size = 38) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(x - size * 0.48, y - size * 0.13);
  context.lineTo(x, y - size * 0.44);
  context.lineTo(x + size * 0.48, y - size * 0.13);
  context.moveTo(x - size * 0.4, y - size * 0.08);
  context.lineTo(x + size * 0.4, y - size * 0.08);
  context.moveTo(x - size * 0.43, y + size * 0.37);
  context.lineTo(x + size * 0.43, y + size * 0.37);
  context.moveTo(x - size * 0.5, y + size * 0.46);
  context.lineTo(x + size * 0.5, y + size * 0.46);
  context.moveTo(x - size * 0.34, y - size * 0.04);
  context.lineTo(x - size * 0.34, y + size * 0.33);
  context.moveTo(x - size * 0.12, y - size * 0.04);
  context.lineTo(x - size * 0.12, y + size * 0.33);
  context.moveTo(x + size * 0.12, y - size * 0.04);
  context.lineTo(x + size * 0.12, y + size * 0.33);
  context.moveTo(x + size * 0.34, y - size * 0.04);
  context.lineTo(x + size * 0.34, y + size * 0.33);
  context.stroke();
  context.restore();
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  fontFamily: string,
  maxSize: number,
  minSize = 20,
) {
  let size = maxSize;
  context.font = `${weight} ${size}px ${fontFamily}`;
  while (size > minSize && context.measureText(text).width > maxWidth) {
    size -= 2;
    context.font = `${weight} ${size}px ${fontFamily}`;
  }
  context.fillText(text, x, y, maxWidth);
}

function compactVenue(venue: string): string {
  return venue
    .replace(/Edificios H e I\s*[·•]\s*/i, '')
    .replace(/Universidad Externado de Colombia/i, 'Universidad Externado')
    .replace(/,\s*La Candelaria,\s*Bogotá/i, ' · La Candelaria')
    .trim();
}

export async function drawAttendingArtwork(
  canvas: HTMLCanvasElement,
  options: AttendingArtworkOptions,
): Promise<{ avatarIncluded: boolean; logoIncluded: boolean }> {
  const renderId = (canvasRenderIds.get(canvas) || 0) + 1;
  canvasRenderIds.set(canvas, renderId);
  const context = canvas.getContext('2d');
  if (!context) return { avatarIncluded: false, logoIncluded: false };

  const [backgroundImage, logo, poweredByLogo, avatar] = await Promise.all([
    loadImage(options.artworkTemplate.backgroundSrc),
    loadImage(options.logoSrc),
    loadImage(options.artworkTemplate.poweredByLogoSrc),
    loadImage(options.avatarSrc),
  ]);
  if (canvasRenderIds.get(canvas) !== renderId) {
    return { avatarIncluded: false, logoIncluded: false };
  }

  canvas.width = ART_WIDTH;
  canvas.height = ART_HEIGHT;
  context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);

  context.fillStyle = '#03123b';
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
  if (backgroundImage) drawCoverImage(context, backgroundImage, 0, 0, ART_WIDTH, ART_HEIGHT);

  const backgroundOverlay = context.createLinearGradient(0, 0, ART_WIDTH * 0.75, ART_HEIGHT);
  backgroundOverlay.addColorStop(0, 'rgba(1, 10, 43, 0.68)');
  backgroundOverlay.addColorStop(0.46, 'rgba(2, 15, 53, 0.52)');
  backgroundOverlay.addColorStop(1, 'rgba(2, 10, 39, 0.96)');
  context.fillStyle = backgroundOverlay;
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);

  const leftOverlay = context.createLinearGradient(0, 0, 630, 0);
  leftOverlay.addColorStop(0, 'rgba(0, 9, 42, 0.82)');
  leftOverlay.addColorStop(0.72, 'rgba(0, 15, 54, 0.4)');
  leftOverlay.addColorStop(1, 'rgba(0, 15, 54, 0)');
  context.fillStyle = leftOverlay;
  context.fillRect(0, 0, 720, 890);

  context.fillStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.18);
  context.beginPath();
  context.arc(1040, 104, 300, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = colorWithAlpha(options.artworkTemplate.secondaryAccentColor, 0.14);
  context.beginPath();
  context.arc(42, 770, 280, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.2);
  context.lineWidth = 2;
  for (let radius = 240; radius <= 540; radius += 54) {
    context.beginPath();
    context.arc(1080, 0, radius, Math.PI * 0.5, Math.PI * 1.5);
    context.stroke();
    context.beginPath();
    context.arc(0, 870, radius, -Math.PI * 0.55, Math.PI * 0.4);
    context.stroke();
  }
  context.restore();

  drawRoundRect(context, 58, 58, 414, 214, 26);
  context.fillStyle = 'rgba(2, 12, 43, 0.68)';
  context.fill();
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.42);
  context.lineWidth = 2;
  context.stroke();
  if (logo) {
    drawContainedImage(context, logo, 82, 74, 364, 154);
  } else {
    context.fillStyle = '#ffffff';
    context.font = '800 46px Manrope, sans-serif';
    context.fillText(options.shortName.toLocaleUpperCase(), 84, 157);
  }

  if (options.artworkTemplate.flagColors.length) {
    const barX = 82;
    const barY = 245;
    const totalWidth = 280;
    const segmentWidth = totalWidth / options.artworkTemplate.flagColors.length;
    options.artworkTemplate.flagColors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(barX + segmentWidth * index, barY, segmentWidth - 5, 8);
    });
  }

  const locationLabel = [options.location, options.shortName].filter(Boolean).join('  ·  ').toLocaleUpperCase();
  context.fillStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.96);
  context.font = '800 22px "IBM Plex Mono", monospace';
  drawFittedText(context, locationLabel, 125, 364, 390, 800, '"IBM Plex Mono", monospace', 22, 16);

  drawLocationPin(context, 89, 418, options.artworkTemplate.accentColor, 35);
  context.fillStyle = '#ffffff';
  context.font = '700 32px Manrope, sans-serif';
  drawFittedText(context, options.location || options.shortName, 126, 429, 385, 700, 'Manrope, sans-serif', 32, 22);

  drawCalendar(context, 89, 500, options.artworkTemplate.accentColor, 36);
  context.fillStyle = '#ffffff';
  context.font = '700 32px Manrope, sans-serif';
  drawFittedText(context, options.dateLabel, 126, 511, 385, 700, 'Manrope, sans-serif', 32, 22);

  drawBuilding(context, 89, 589, options.artworkTemplate.accentColor, 37);
  context.fillStyle = '#ffffff';
  context.font = '600 27px Manrope, sans-serif';
  wrapText(context, compactVenue(options.venue), 126, 581, 385, 34, 3);

  drawPortrait(
    context,
    avatar,
    options.attendeeName,
    options.artworkTemplate.accentColor,
    options.artworkTemplate.secondaryAccentColor,
  );

  drawRoundRect(context, 58, 817, 964, 466, 34);
  const panel = context.createLinearGradient(0, 817, 0, 1283);
  panel.addColorStop(0, 'rgba(2, 13, 46, 0.93)');
  panel.addColorStop(1, 'rgba(2, 10, 37, 0.98)');
  context.fillStyle = panel;
  context.shadowColor = colorWithAlpha(options.artworkTemplate.accentColor, 0.4);
  context.shadowBlur = 28;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.78);
  context.lineWidth = 3;
  context.stroke();

  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.font = '900 88px Manrope, sans-serif';
  const headline = options.pastEvent ? options.intentions.past : options.intentions.upcoming;
  const headlineGradient = context.createLinearGradient(150, 872, 930, 970);
  headlineGradient.addColorStop(0, '#ffffff');
  headlineGradient.addColorStop(0.52, '#dffaff');
  headlineGradient.addColorStop(1, options.artworkTemplate.accentColor);
  context.fillStyle = headlineGradient;
  drawFittedText(context, headline, ART_WIDTH / 2, 926, 850, 900, 'Manrope, sans-serif', 88, 58);

  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.52);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(111, 970);
  context.lineTo(969, 970);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.font = '800 40px Manrope, sans-serif';
  drawFittedText(context, options.eventName, ART_WIDTH / 2, 1023, 864, 800, 'Manrope, sans-serif', 40, 27);

  const venueLabel = compactVenue(options.venue).replace(/\s*[·•]\s*La Candelaria$/i, '');
  const detailY = 1082;
  context.textAlign = 'left';
  drawLocationPin(context, 148, detailY - 7, options.artworkTemplate.accentColor, 29);
  context.fillStyle = '#edf7ff';
  context.font = '600 25px Manrope, sans-serif';
  drawFittedText(context, options.location.split(',')[0] || options.location, 178, detailY, 205, 600, 'Manrope, sans-serif', 25, 18);

  drawCalendar(context, 411, detailY - 7, options.artworkTemplate.accentColor, 29);
  context.fillStyle = '#edf7ff';
  context.font = '600 25px Manrope, sans-serif';
  drawFittedText(context, options.dateLabel, 440, detailY, 260, 600, 'Manrope, sans-serif', 25, 16);

  drawBuilding(context, 731, detailY - 7, options.artworkTemplate.accentColor, 29);
  context.fillStyle = '#edf7ff';
  context.font = '600 24px Manrope, sans-serif';
  drawFittedText(context, venueLabel, 762, detailY, 210, 600, 'Manrope, sans-serif', 24, 16);

  drawRoundRect(context, 175, 1124, 730, 67, 34);
  context.fillStyle = 'rgba(5, 29, 75, 0.78)';
  context.fill();
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.9);
  context.lineWidth = 2;
  context.stroke();

  const identity = [
    options.attendeeName.trim() || options.intentions.emptyName,
    options.attendeeRole.trim(),
    options.attendeeSocialHandle,
  ].filter(Boolean).join('  ·  ');
  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.font = '700 33px Manrope, sans-serif';
  drawFittedText(context, identity, ART_WIDTH / 2, 1168, 680, 700, 'Manrope, sans-serif', 33, 20);

  context.fillStyle = options.artworkTemplate.accentColor;
  context.font = '700 23px "IBM Plex Mono", monospace';
  context.fillText(options.artworkTemplate.hashtags.join('   '), ART_WIDTH / 2, 1245, 850);

  context.textAlign = 'right';
  context.fillStyle = 'rgba(230, 244, 255, 0.66)';
  context.font = '600 16px Manrope, sans-serif';
  const labelWidth = context.measureText(options.poweredByLabel).width;
  const brandWidth = 155;
  const groupStart = (ART_WIDTH - labelWidth - 12 - brandWidth) / 2;
  context.textAlign = 'left';
  context.fillText(options.poweredByLabel, groupStart, 1321);
  if (poweredByLogo) {
    drawContainedImage(context, poweredByLogo, groupStart + labelWidth + 12, 1299, brandWidth, 39);
  } else {
    context.textAlign = 'left';
    context.fillStyle = 'rgba(230, 244, 255, 0.76)';
    context.font = '800 18px Manrope, sans-serif';
    context.fillText('HASHPASS', groupStart + labelWidth + 12, 1321);
  }
  context.textAlign = 'left';

  return { avatarIncluded: !!avatar, logoIncluded: !!logo };
}
