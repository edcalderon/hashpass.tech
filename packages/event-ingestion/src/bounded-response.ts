export interface BoundedResponse {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Reads a fetch response incrementally so a missing or dishonest Content-Length
 * cannot cause an ingestion worker to buffer an unbounded body in memory.
 */
export async function readLimitedResponse(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<BoundedResponse> {
  if (!response.ok) throw new Error(`${label} responded ${response.status}`);

  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }

  if (!response.body) {
    return {
      bytes: new Uint8Array(),
      contentType: response.headers.get("content-type") || "",
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, contentType: response.headers.get("content-type") || "" };
}
