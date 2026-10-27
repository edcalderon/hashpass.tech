/**
 * Node headers for a fetch `Response`. `Headers.entries()` merges repeated `set-cookie` fields into one, which
 * drops all but the last cookie, so cookies are passed through as an array.
 */
export function nodeHeaders(response) {
  const headers = {};
  for (const [name, value] of response.headers.entries()) {
    if (name !== "set-cookie") headers[name] = value;
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  return headers;
}

/** Writes a fetch `Response` to a Node `ServerResponse`. */
export async function sendResponse(response, outgoing) {
  outgoing.writeHead(response.status, nodeHeaders(response));
  if (!response.body) return outgoing.end();
  for await (const chunk of response.body) outgoing.write(chunk);
  outgoing.end();
}
