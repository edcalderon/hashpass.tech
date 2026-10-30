import type { AttendeeSocialPlatform, AttendingArtworkOptions } from '../app/attending/types/attending.types';

const ART_WIDTH = 1080;
const ART_HEIGHT = 1350;
// Served from /attending so tenant overlays that only copy that folder (BSL)
// still resolve it; a root-relative path falls through to the SPA HTML there.
export const LIGHT_POWERED_BY_LOGO_SRC = '/attending/logo-full-hashpass-black-red.svg';
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const canvasRenderIds = new WeakMap<HTMLCanvasElement, number>();

export function getAttendingArtworkHeadline(
  options: Pick<AttendingArtworkOptions, 'pastEvent' | 'intentions'>,
): string {
  return options.pastEvent ? options.intentions.past : options.intentions.upcoming;
}

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

function drawSocialIcon(
  context: CanvasRenderingContext2D,
  platform: AttendeeSocialPlatform,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2.2;
  if (platform === 'x') {
    const path = new Path2D('M18.901 1.153h3.68l-8.04 9.19 9.46 12.504h-7.41l-5.804-7.588-6.64 7.588H.466l8.6-9.83L0 1.153h7.598l5.245 6.932z');
    context.translate(x, y);
    context.scale(size / 24, size / 24);
    context.fill(path);
  } else {
    drawRoundRect(context, x + 1, y + 1, size - 2, size - 2, size * 0.27);
    context.stroke();
    context.beginPath();
    context.arc(x + size / 2, y + size / 2, size * 0.22, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(x + size * 0.72, y + size * 0.29, size * 0.065, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawSocialHandles(
  context: CanvasRenderingContext2D,
  options: AttendingArtworkOptions,
  top = 1182,
  color = '#f3f8ff',
) {
  const handles = [
    { platform: 'x' as const, handle: options.attendeeSocialHandles.x },
    { platform: 'instagram' as const, handle: options.attendeeSocialHandles.instagram },
  ].filter(({ handle }) => handle);
  if (!handles.length) return;

  context.save();
  context.font = '600 22px Manrope, sans-serif';
  const iconSize = 22;
  const iconGap = 9;
  const itemGap = 36;
  const widths = handles.map(({ handle }) => iconSize + iconGap + context.measureText(handle).width);
  const totalWidth = widths.reduce((total, width) => total + width, 0) + itemGap * (handles.length - 1);
  let x = (ART_WIDTH - totalWidth) / 2;
  handles.forEach(({ platform, handle }, index) => {
    drawSocialIcon(context, platform, x, top, iconSize, color);
    context.fillStyle = color;
    context.textAlign = 'left';
    context.fillText(handle, x + iconSize + iconGap, top + 19);
    x += widths[index] + itemGap;
  });
  context.restore();
}

function drawPortrait(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  name: string,
  accentColor: string,
  secondaryAccentColor: string,
  transparentPortrait: boolean,
  layout = { x: 548, y: 78, width: 470, height: 785, radius: 196, verticalAnchor: 0.5 },
) {
  const { x, y, width, height, radius, verticalAnchor } = layout;

  if (image && transparentPortrait) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.shadowColor = 'rgba(0, 0, 0, 0.24)';
    context.shadowBlur = 20;
    context.shadowOffsetY = 10;
    context.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) * verticalAnchor,
      drawWidth,
      drawHeight,
    );
    context.restore();
    return;
  }

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
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) * verticalAnchor, drawWidth, drawHeight);
  } else {
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || '★';
    context.fillStyle = '#ffffff';
    context.font = '700 126px Fraunces, Georgia, serif';
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

function drawCenteredEventDetail(
  context: CanvasRenderingContext2D,
  icon: 'calendar' | 'location',
  text: string,
  centerX: number,
  iconY: number,
  textY: number,
  maxGroupWidth: number,
  iconColor: string,
  textColor: string,
  iconSize = 30,
) {
  const iconGap = 12;
  const textMaxWidth = maxGroupWidth - iconSize - iconGap;
  let fontSize = 28;
  context.font = `700 ${fontSize}px Manrope, sans-serif`;
  while (fontSize > 19 && context.measureText(text).width > textMaxWidth) {
    fontSize = Math.max(19, fontSize - 2);
    context.font = `700 ${fontSize}px Manrope, sans-serif`;
  }

  const textWidth = Math.min(context.measureText(text).width, textMaxWidth);
  const groupWidth = iconSize + iconGap + textWidth;
  const groupStart = centerX - groupWidth / 2;
  const iconCenter = groupStart + iconSize / 2;

  if (icon === 'calendar') {
    drawCalendar(context, iconCenter, iconY, iconColor, iconSize);
  } else {
    drawLocationPin(context, iconCenter, iconY, iconColor, iconSize);
  }

  context.fillStyle = textColor;
  context.textAlign = 'left';
  context.font = `700 ${fontSize}px Manrope, sans-serif`;
  context.fillText(text, groupStart + iconSize + iconGap, textY, textMaxWidth);
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

function drawFittedWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  fontFamily: string,
  maxSize: number,
  minSize: number,
  maxLines: number,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let size = maxSize;
  let lines: string[] = [];

  const wrapAtCurrentSize = () => {
    const wrapped: string[] = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        wrapped.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) wrapped.push(line);
    return wrapped;
  };

  while (size >= minSize) {
    context.font = `${weight} ${size}px ${fontFamily}`;
    lines = wrapAtCurrentSize();
    if (lines.length <= maxLines && lines.every((line) => context.measureText(line).width <= maxWidth)) break;
    size -= 2;
  }

  context.font = `${weight} ${size}px ${fontFamily}`;
  lines.slice(0, maxLines).forEach((line, index) => {
    context.fillText(line, x, y + index * size * 1.04, maxWidth);
  });
  return Math.min(lines.length, maxLines) * size * 1.04;
}

function compactVenue(venue: string): string {
  return venue
    .replace(/Edificios H e I\s*[·•]\s*/i, '')
    .replace(/Universidad Externado de Colombia/i, 'Universidad Externado')
    .replace(/,\s*La Candelaria,\s*Bogotá/i, ' · La Candelaria')
    .trim();
}

function drawColombiaFlagRibbon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: string[],
) {
  if (colors.length < 3) return;
  const yellowWidth = width / 2;
  const blueWidth = width / 4;
  context.fillStyle = colors[0];
  context.fillRect(x, y, yellowWidth, height);
  context.fillStyle = colors[1];
  context.fillRect(x + yellowWidth, y, blueWidth, height);
  context.fillStyle = colors[2];
  context.fillRect(x + yellowWidth + blueWidth, y, width - yellowWidth - blueWidth, height);
}

function drawFrostedArtworkPanel(
  context: CanvasRenderingContext2D,
  lightMode: boolean,
  accentColor: string,
) {
  const x = 56;
  const y = 686;
  const width = 968;
  const height = 643;
  const radius = 46;
  const inset = 20;
  const backdrop = document.createElement('canvas');
  backdrop.width = width + inset * 2;
  backdrop.height = height + inset * 2;
  const backdropContext = backdrop.getContext('2d');
  backdropContext?.drawImage(
    context.canvas,
    x - inset,
    y - inset,
    backdrop.width,
    backdrop.height,
    0,
    0,
    backdrop.width,
    backdrop.height,
  );

  context.save();
  drawRoundRect(context, x, y, width, height, radius);
  context.clip();
  if (backdropContext) {
    context.filter = 'blur(14px)';
    context.drawImage(backdrop, x - inset, y - inset);
    context.filter = 'none';
  }
  const glass = context.createLinearGradient(0, y, 0, y + height);
  glass.addColorStop(0, lightMode ? 'rgba(249, 250, 252, 0.78)' : 'rgba(2, 12, 42, 0.78)');
  glass.addColorStop(1, lightMode ? 'rgba(243, 245, 248, 0.86)' : 'rgba(1, 8, 31, 0.86)');
  context.fillStyle = glass;
  context.fillRect(x, y, width, height);
  context.restore();

  context.save();
  drawRoundRect(context, x, y, width, height, radius);
  context.shadowColor = colorWithAlpha(accentColor, lightMode ? 0.12 : 0.24);
  context.shadowBlur = 15;
  context.strokeStyle = lightMode ? 'rgba(175, 13, 1, 0.48)' : colorWithAlpha(accentColor, 0.9);
  context.lineWidth = 3;
  context.stroke();
  context.shadowBlur = 0;
  context.beginPath();
  context.moveTo(x + 38, y + 1);
  context.lineTo(x + width - 38, y + 1);
  context.strokeStyle = lightMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(217, 244, 255, 0.22)';
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawBslColombiaArtwork(
  context: CanvasRenderingContext2D,
  options: AttendingArtworkOptions,
  assets: {
    backgroundImage: HTMLImageElement | null;
    logo: HTMLImageElement | null;
    poweredByLogo: HTMLImageElement | null;
    avatar: HTMLImageElement | null;
  },
) {
  const { backgroundImage, logo, poweredByLogo, avatar } = assets;
  const { accentColor, secondaryAccentColor, flagColors, hashtags } = options.artworkTemplate;
  const lightMode = options.themeMode === 'light';
  const themeAccent = lightMode ? '#536d85' : accentColor;
  const iconAccent = lightMode ? '#af0d01' : themeAccent;
  const headingColor = lightMode ? '#101b30' : '#f7fbff';
  const detailColor = lightMode ? '#243248' : '#f3f8ff';

  context.fillStyle = '#06142e';
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
  if (backgroundImage) drawCoverImage(context, backgroundImage, 0, 0, ART_WIDTH, ART_HEIGHT);

  // Let Bogotá's skyline and Monserrate read through the poster instead of
  // burying the photograph under the previous heavy all-over tint.
  const photoWash = context.createLinearGradient(0, 0, 0, ART_HEIGHT);
  photoWash.addColorStop(0, lightMode ? 'rgba(235, 240, 248, 0.1)' : 'rgba(2, 12, 42, 0.24)');
  photoWash.addColorStop(0.45, lightMode ? 'rgba(235, 240, 248, 0.04)' : 'rgba(2, 12, 42, 0.08)');
  photoWash.addColorStop(0.68, lightMode ? 'rgba(235, 240, 248, 0.1)' : 'rgba(2, 12, 42, 0.2)');
  photoWash.addColorStop(1, lightMode ? 'rgba(235, 240, 248, 0.2)' : 'rgba(2, 12, 42, 0.64)');
  context.fillStyle = photoWash;
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);

  const leftWash = context.createLinearGradient(0, 0, 620, 0);
  leftWash.addColorStop(0, lightMode ? 'rgba(249, 250, 252, 0.88)' : 'rgba(1, 9, 35, 0.62)');
  leftWash.addColorStop(0.66, lightMode ? 'rgba(249, 250, 252, 0.74)' : 'rgba(1, 9, 35, 0.28)');
  leftWash.addColorStop(1, lightMode ? 'rgba(249, 250, 252, 0.1)' : 'rgba(1, 9, 35, 0)');
  context.fillStyle = leftWash;
  context.fillRect(0, 0, 660, 760);

  context.save();
  context.strokeStyle = colorWithAlpha(themeAccent, lightMode ? 0.14 : 0.3);
  context.lineWidth = 2;
  for (let radius = 245; radius <= 515; radius += 54) {
    context.beginPath();
    context.arc(1115, 90, radius, Math.PI * 0.56, Math.PI * 1.43);
    context.stroke();
    context.beginPath();
    context.arc(-26, 714, radius, -Math.PI * 0.48, Math.PI * 0.39);
    context.stroke();
  }
  context.restore();

  drawPortrait(
    context,
    avatar,
    options.attendeeName,
    lightMode ? '#607f99' : accentColor,
    lightMode ? '#3c5f7d' : secondaryAccentColor,
    options.transparentPortrait,
    { x: 470, y: 22, width: 554, height: 910, radius: 208, verticalAnchor: 0.36 },
  );

  // Event mark and the Colombian colors anchor the upper-left corner while
  // the larger portrait carries the visual weight of the composition.
  drawRoundRect(context, 54, 44, 448, 256, 34);
  context.fillStyle = 'rgba(2, 11, 38, 0.64)';
  context.fill();
  context.strokeStyle = colorWithAlpha(themeAccent, 0.38);
  context.lineWidth = 1.5;
  context.stroke();
  if (logo) {
    drawContainedImage(context, logo, 78, 57, 400, 178);
  } else {
    context.fillStyle = '#ffffff';
    context.font = '800 56px Manrope, sans-serif';
    context.fillText(options.shortName.toLocaleUpperCase(), 84, 157);
  }
  drawColombiaFlagRibbon(context, 109, 244, 338, 9, flagColors);
  context.fillStyle = '#f3f8ff';
  context.font = '700 16px "IBM Plex Mono", monospace';
  context.textAlign = 'center';
  context.fillText('BSL  ·  COLOMBIA 2026', 278, 282);

  // Put the attendee's intention in the open left column. The two-line serif
  // display treatment keeps the headline legible beside the larger portrait
  // while preserving the active locale's exact wording.
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = iconAccent;
  context.font = '700 22px "IBM Plex Mono", monospace';
  context.fillText(options.shortName.toLocaleUpperCase(), 58, 358);

  const headline = getAttendingArtworkHeadline(options);
  context.fillStyle = headingColor;
  context.shadowColor = lightMode ? 'transparent' : 'rgba(0, 0, 0, 0.38)';
  context.shadowBlur = lightMode ? 0 : 16;
  drawFittedWrappedText(context, headline, 58, 466, 420, 700, 'Fraunces, Georgia, serif', 104, 62, 2);
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.fillStyle = iconAccent;
  context.fillRect(58, 626, 124, 8);
  context.fillStyle = colorWithAlpha(iconAccent, 0.82);
  context.fillRect(198, 626, 52, 8);

  drawFrostedArtworkPanel(context, lightMode, iconAccent);

  context.textAlign = 'center';

  context.fillStyle = lightMode ? '#17243a' : '#eaf7ff';
  context.font = '700 58px Fraunces, Georgia, serif';
  drawFittedText(context, options.eventName, ART_WIDTH / 2, 786, 854, 700, 'Fraunces, Georgia, serif', 58, 34);

  context.strokeStyle = colorWithAlpha(themeAccent, lightMode ? 0.26 : 0.66);
  context.lineWidth = lightMode ? 1.5 : 2;
  context.beginPath();
  context.moveTo(118, 814);
  context.lineTo(962, 814);
  context.stroke();

  context.textAlign = 'left';
  drawCenteredEventDetail(context, 'calendar', options.dateLabel, 325, 860, 870, 386, iconAccent, detailColor);

  context.strokeStyle = colorWithAlpha(themeAccent, lightMode ? 0.22 : 0.42);
  context.beginPath();
  context.moveTo(532, 834);
  context.lineTo(532, 890);
  context.stroke();

  drawCenteredEventDetail(context, 'location', options.location, 747, 863, 870, 400, iconAccent, detailColor);

  context.strokeStyle = colorWithAlpha(themeAccent, lightMode ? 0.28 : 0.5);
  context.beginPath();
  context.moveTo(118, 904);
  context.lineTo(962, 904);
  context.stroke();

  const venueLabel = compactVenue(options.venue);
  if (venueLabel) {
    let venueFontSize = 27;
    context.font = `700 ${venueFontSize}px Manrope, sans-serif`;
    while (venueFontSize > 18 && context.measureText(venueLabel).width > 790) {
      venueFontSize = Math.max(18, venueFontSize - 2);
      context.font = `700 ${venueFontSize}px Manrope, sans-serif`;
    }
    const venueTextWidth = Math.min(context.measureText(venueLabel).width, 790);
    const venueGroupWidth = 30 + 16 + venueTextWidth;
    const venueGroupStart = (ART_WIDTH - venueGroupWidth) / 2;
    drawBuilding(context, venueGroupStart + 15, 943, iconAccent, 30);
    context.fillStyle = detailColor;
    context.textAlign = 'left';
    drawFittedText(
      context,
      venueLabel,
      venueGroupStart + 46,
      956,
      790,
      700,
      'Manrope, sans-serif',
      venueFontSize,
      18,
    );
  }

  drawRoundRect(context, 150, 984, 780, 72, 36);
  context.fillStyle = lightMode ? 'rgba(175, 13, 1, 0.08)' : 'rgba(8, 30, 70, 0.66)';
  context.fill();
  context.strokeStyle = lightMode
    ? 'rgba(175, 13, 1, 0.28)'
    : colorWithAlpha(themeAccent, 0.58);
  context.lineWidth = 1.5;
  context.stroke();
  const identity = [
    options.attendeeName.trim() || options.intentions.emptyName,
    options.attendeeRole.trim(),
  ].filter(Boolean).join('  ·  ');
  context.textAlign = 'center';
  context.fillStyle = lightMode ? '#142238' : '#ffffff';
  context.font = '800 34px Manrope, sans-serif';
  drawFittedText(context, identity, ART_WIDTH / 2, 1031, 720, 800, 'Manrope, sans-serif', 34, 20);

  const hasSocial = !!(options.attendeeSocialHandles.x || options.attendeeSocialHandles.instagram);
  if (hasSocial) drawSocialHandles(context, options, 1080, detailColor);

  context.fillStyle = lightMode ? '#526b82' : themeAccent;
  context.font = '700 22px "IBM Plex Mono", monospace';
  drawFittedText(context, hashtags.join('   '), ART_WIDTH / 2, hasSocial ? 1161 : 1114, 850, 700, '"IBM Plex Mono", monospace', 22, 15);
  const poweredByY = hasSocial ? 1270 : 1200;

  context.textAlign = 'left';
  context.fillStyle = lightMode ? 'rgba(116, 45, 43, 0.82)' : 'rgba(230, 244, 255, 0.78)';
  context.font = '500 15px "IBM Plex Mono", monospace';
  const labelWidth = context.measureText(options.poweredByLabel).width;
  const brandWidth = 150;
  const groupStart = (ART_WIDTH - labelWidth - 12 - brandWidth) / 2;
  context.fillStyle = lightMode ? 'rgba(116, 45, 43, 0.82)' : 'rgba(230, 244, 255, 0.78)';
  context.fillText(options.poweredByLabel, groupStart, poweredByY);
  if (poweredByLogo) {
    drawContainedImage(context, poweredByLogo, groupStart + labelWidth + 12, poweredByY - 19, brandWidth, 36);
  } else {
    context.fillStyle = lightMode ? '#101b30' : 'rgba(230, 244, 255, 0.84)';
    context.font = '800 18px Manrope, sans-serif';
    context.fillText('HASHPASS', groupStart + labelWidth + 12, poweredByY);
  }
  context.textAlign = 'left';
}

export async function drawAttendingArtwork(
  canvas: HTMLCanvasElement,
  options: AttendingArtworkOptions,
): Promise<{ avatarIncluded: boolean; logoIncluded: boolean }> {
  const renderId = (canvasRenderIds.get(canvas) || 0) + 1;
  canvasRenderIds.set(canvas, renderId);
  const context = canvas.getContext('2d');
  if (!context) return { avatarIncluded: false, logoIncluded: false };

  const isBslColombia = options.artworkTemplate.backgroundSrc?.endsWith('/bsl-colombia-2026.png') || false;
  const poweredByLogoSrc = isBslColombia && options.themeMode === 'light'
    ? LIGHT_POWERED_BY_LOGO_SRC
    : options.artworkTemplate.poweredByLogoSrc;
  const [backgroundImage, logo, poweredByLogo, avatar] = await Promise.all([
    loadImage(options.artworkTemplate.backgroundSrc),
    loadImage(options.logoSrc),
    loadImage(poweredByLogoSrc),
    loadImage(options.avatarSrc),
  ]);
  await document.fonts?.ready;
  if (canvasRenderIds.get(canvas) !== renderId) {
    return { avatarIncluded: false, logoIncluded: false };
  }

  canvas.width = ART_WIDTH;
  canvas.height = ART_HEIGHT;
  context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);

  if (isBslColombia) {
    drawBslColombiaArtwork(context, options, { backgroundImage, logo, poweredByLogo, avatar });
    return { avatarIncluded: !!avatar, logoIncluded: !!logo };
  }

  context.fillStyle = '#06142e';
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
  if (backgroundImage) drawCoverImage(context, backgroundImage, 0, 0, ART_WIDTH, ART_HEIGHT);

  const backgroundOverlay = context.createLinearGradient(0, 0, ART_WIDTH, ART_HEIGHT);
  backgroundOverlay.addColorStop(0, 'rgba(1, 10, 35, 0.72)');
  backgroundOverlay.addColorStop(0.5, 'rgba(2, 15, 47, 0.48)');
  backgroundOverlay.addColorStop(1, 'rgba(2, 10, 35, 0.96)');
  context.fillStyle = backgroundOverlay;
  context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);

  const leftOverlay = context.createLinearGradient(0, 0, 630, 0);
  leftOverlay.addColorStop(0, 'rgba(0, 9, 38, 0.88)');
  leftOverlay.addColorStop(0.72, 'rgba(0, 15, 48, 0.48)');
  leftOverlay.addColorStop(1, 'rgba(0, 15, 48, 0)');
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

  drawPortrait(
    context,
    avatar,
    options.attendeeName,
    options.artworkTemplate.accentColor,
    options.artworkTemplate.secondaryAccentColor,
    options.transparentPortrait,
  );

  context.fillStyle = options.artworkTemplate.accentColor;
  context.font = '600 18px "IBM Plex Mono", monospace';
  context.fillText(options.shortName.toLocaleUpperCase(), 84, 414, 420);

  const headline = getAttendingArtworkHeadline(options);
  context.textAlign = 'left';
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.34)';
  context.shadowBlur = 18;
  context.font = '700 90px Fraunces, Georgia, serif';
  wrapText(context, headline, 82, 502, 430, 96, 2);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.fillStyle = options.artworkTemplate.accentColor;
  context.fillRect(84, 690, 116, 8);
  context.fillStyle = colorWithAlpha(options.artworkTemplate.secondaryAccentColor, 0.9);
  context.fillRect(210, 690, 48, 8);

  drawRoundRect(context, 58, 757, 964, 570, 34);
  context.fillStyle = 'rgba(2, 12, 39, 0.97)';
  context.fill();
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.76);
  context.lineWidth = 3;
  context.stroke();

  context.textAlign = 'center';
  context.fillStyle = options.artworkTemplate.accentColor;
  context.font = '600 18px "IBM Plex Mono", monospace';
  drawFittedText(context, options.shortName.toLocaleUpperCase(), ART_WIDTH / 2, 817, 820, 600, '"IBM Plex Mono", monospace', 18, 15);

  context.fillStyle = '#ffffff';
  context.font = '700 54px Fraunces, Georgia, serif';
  drawFittedText(context, options.eventName, ART_WIDTH / 2, 883, 850, 700, 'Fraunces, Georgia, serif', 54, 30);

  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.48);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(112, 913);
  context.lineTo(968, 913);
  context.stroke();

  context.textAlign = 'left';
  if (options.dateLabel) {
    drawCenteredEventDetail(context, 'calendar', options.dateLabel, 326, 969, 980, 400, options.artworkTemplate.accentColor, '#f3f8ff', 32);
  }
  if (options.location) {
    drawCenteredEventDetail(context, 'location', options.location, 754, 969, 980, 400, options.artworkTemplate.accentColor, '#f3f8ff', 32);
  }

  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.42);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(112, 1011);
  context.lineTo(968, 1011);
  context.stroke();

  const venueLabel = compactVenue(options.venue);
  if (venueLabel) {
    drawBuilding(context, 145, 1049, options.artworkTemplate.accentColor, 32);
    context.fillStyle = '#f3f8ff';
    context.font = '600 27px Manrope, sans-serif';
    drawFittedText(context, venueLabel, 178, 1060, 780, 600, 'Manrope, sans-serif', 27, 20);
  }

  const identityPillY = 1090;
  drawRoundRect(context, 160, identityPillY, 760, 74, 37);
  context.fillStyle = 'rgba(8, 30, 70, 0.86)';
  context.fill();
  context.strokeStyle = colorWithAlpha(options.artworkTemplate.accentColor, 0.9);
  context.lineWidth = 2;
  context.stroke();

  const identity = [
    options.attendeeName.trim() || options.intentions.emptyName,
    options.attendeeRole.trim(),
  ].filter(Boolean).join('  ·  ');
  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.font = '700 33px Manrope, sans-serif';
  drawFittedText(context, identity, ART_WIDTH / 2, identityPillY + 46, 700, 700, 'Manrope, sans-serif', 33, 20);

  drawSocialHandles(context, options, 1182);

  context.fillStyle = options.artworkTemplate.accentColor;
  context.font = '600 22px "IBM Plex Mono", monospace';
  context.fillText(options.artworkTemplate.hashtags.join('   '), ART_WIDTH / 2, 1244, 850);

  context.textAlign = 'right';
  context.fillStyle = 'rgba(230, 244, 255, 0.66)';
  context.font = '500 15px "IBM Plex Mono", monospace';
  const labelWidth = context.measureText(options.poweredByLabel).width;
  const brandWidth = 150;
  const groupStart = (ART_WIDTH - labelWidth - 12 - brandWidth) / 2;
  context.textAlign = 'left';
  context.fillText(options.poweredByLabel, groupStart, 1295);
  if (poweredByLogo) {
    drawContainedImage(context, poweredByLogo, groupStart + labelWidth + 12, 1276, brandWidth, 36);
  } else {
    context.fillStyle = 'rgba(230, 244, 255, 0.76)';
    context.font = '800 18px Manrope, sans-serif';
    context.fillText('HASHPASS', groupStart + labelWidth + 12, 1295);
  }
  context.textAlign = 'left';

  return { avatarIncluded: !!avatar, logoIncluded: !!logo };
}
