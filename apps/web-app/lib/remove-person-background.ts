import type { ImageSegmenter } from '@mediapipe/tasks-vision';

const MEDIA_PIPE_VERSION = '1.2.0';
const WASM_BASE_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIA_PIPE_VERSION}/wasm`;
const SELFIE_SEGMENTER_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
const MAX_PROCESSING_DIMENSION = 1440;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getImageSegmenter(): Promise<ImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;

  const pendingSegmenter = (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: SELFIE_SEGMENTER_MODEL },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
    });
  })();

  segmenterPromise = pendingSegmenter;
  void pendingSegmenter.catch(() => {
    if (segmenterPromise === pendingSegmenter) segmenterPromise = null;
  });
  return pendingSegmenter;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected photo could not be opened.'));
    image.src = source;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The transparent photo could not be created.'));
    }, 'image/png');
  });
}

/** Segments a portrait locally and returns a transparent PNG object URL. */
export async function removePersonBackground(source: string): Promise<string> {
  const [image, segmenter] = await Promise.all([loadImage(source), getImageSegmenter()]);
  const scale = Math.min(1, MAX_PROCESSING_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = width;
  inputCanvas.height = height;
  const inputContext = inputCanvas.getContext('2d');
  if (!inputContext) throw new Error('Photo processing is not available in this browser.');
  inputContext.imageSmoothingEnabled = true;
  inputContext.imageSmoothingQuality = 'high';
  inputContext.drawImage(image, 0, 0, width, height);

  const result = segmenter.segment(inputCanvas);
  try {
    const labels = segmenter.getLabels();
    const masks = result.confidenceMasks ?? [];
    const personIndex = labels.findIndex((label) => /person|foreground|subject/i.test(label));
    const backgroundIndex = labels.findIndex((label) => /background/i.test(label));
    const inferredPersonIndex = personIndex >= 0
      ? personIndex
      : masks.length === 1
        ? 0
        : backgroundIndex >= 0
          ? labels.findIndex((_, index) => index !== backgroundIndex)
          : -1;
    const personMask = inferredPersonIndex >= 0 ? masks[inferredPersonIndex] : undefined;
    if (!personMask) throw new Error('The person mask was not returned by the segmentation model.');

    const maskWidth = personMask.width;
    const maskHeight = personMask.height;
    const confidence = personMask.getAsFloat32Array();
    if (confidence.length !== maskWidth * maskHeight) {
      throw new Error('The person mask has an unsupported size.');
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) throw new Error('Photo processing is not available in this browser.');

    const maskPixels = maskContext.createImageData(maskWidth, maskHeight);
    for (let index = 0; index < confidence.length; index += 1) {
      const normalized = Math.max(0, Math.min(1, (confidence[index] - 0.12) / 0.52));
      const alpha = normalized * normalized * (3 - 2 * normalized);
      const pixelOffset = index * 4;
      maskPixels.data[pixelOffset] = 255;
      maskPixels.data[pixelOffset + 1] = 255;
      maskPixels.data[pixelOffset + 2] = 255;
      maskPixels.data[pixelOffset + 3] = Math.round(alpha * 255);
    }
    maskContext.putImageData(maskPixels, 0, 0);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('Photo processing is not available in this browser.');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(inputCanvas, 0, 0);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.drawImage(maskCanvas, 0, 0, width, height);

    return URL.createObjectURL(await canvasToPng(outputCanvas));
  } finally {
    result.confidenceMasks?.forEach((mask) => mask.close());
    result.categoryMask?.close();
  }
}
