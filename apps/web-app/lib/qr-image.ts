// Client-side QR -> PNG export. `react-qr-code` renders a real <svg> (see
// its QRCode component, forwardRef'd straight to the DOM node), so this
// rasterizes exactly that element rather than regenerating the QR pattern
// independently -- what a user sees on screen is guaranteed to be what they
// download, branding icon overlay included.

const EXPORT_SIZE = 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function rasterizeSvg(svgElement: SVGSVGElement, size: number): Promise<HTMLCanvasElement> {
  // Cloned and re-sized before serializing -- the on-screen SVG is small
  // (a compact preview), and drawing a small raster onto a large canvas
  // would upscale and blur it. Setting explicit width/height on the clone
  // makes the browser rasterize the SVG at export resolution directly.
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(size));
  clone.setAttribute('height', String(size));

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  const image = await loadImage(svgDataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  ctx.drawImage(image, 0, 0, size, size);
  return canvas;
}

export interface DownloadQrOptions {
  fileName: string;
  /** Draws a small circular badge with this image centered on the QR -- mirrors the on-screen preview's branding overlay. */
  brandIconSrc?: string;
}

export async function downloadQrPng(svgElement: SVGSVGElement, options: DownloadQrOptions): Promise<void> {
  const canvas = await rasterizeSvg(svgElement, EXPORT_SIZE);

  if (options.brandIconSrc) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');
    const icon = await loadImage(options.brandIconSrc);

    const center = EXPORT_SIZE / 2;
    const iconSize = EXPORT_SIZE * 0.2;
    const badgeRadius = iconSize * 0.66;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(center, center, badgeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(icon, center - iconSize / 2, center - iconSize / 2, iconSize, iconSize);
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not generate a PNG from this QR code');

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
