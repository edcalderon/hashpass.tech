/* eslint-disable no-restricted-syntax -- Server-side OAuth routes intentionally call fetch directly. */

const normalizeBaseUrl = (value: string): string => value.replace(/\/$/, '');
const FETCH_RETRY_COUNT = 3;
const FETCH_RETRY_DELAY_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getDirectusBaseCandidates = (directusUrl: string): string[] => {
  const candidates = new Set<string>();
  const normalized = normalizeBaseUrl(directusUrl);
  candidates.add(normalized);

  try {
    const parsed = new URL(normalized);

    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.add(normalizeBaseUrl(parsed.toString()));
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.add(normalizeBaseUrl(parsed.toString()));
    }
  } catch {
    // Keep only the provided base URL when parsing fails.
  }

  return Array.from(candidates);
};

export async function fetchDirectus(
  directusUrl: string,
  path: string,
  init: RequestInit
): Promise<Response> {
  const candidates = getDirectusBaseCandidates(directusUrl);
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    for (let attempt = 1; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
      try {
        return await fetch(new URL(path, baseUrl), init);
      } catch (error) {
        lastError = error;

        if (attempt < FETCH_RETRY_COUNT) {
          await sleep(FETCH_RETRY_DELAY_MS * attempt);
        }
      }
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : String(lastError || 'Unknown Directus fetch failure');
  throw new Error(`Directus request failed after trying ${candidates.join(', ')}: ${message}`);
}
