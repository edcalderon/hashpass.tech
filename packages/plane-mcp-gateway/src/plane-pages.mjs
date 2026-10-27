/**
 * Page operations for self-hosted Plane Community.
 *
 * Plane's public `/api/v1` has no page routes (verified through v1.4.3-rc2 and the `preview` branch), so the
 * MCP server's `page` tool always gets a 404 there. Pages only exist on the web app's own API, which is
 * session-authenticated. This client signs in once with a dedicated Plane account held server-side, keeps the
 * session in memory, and re-signs in when Plane rejects it. Credentials never leave this process.
 */

import {documentFormatsFromHtml} from "./plane-document.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const PAGE_ACTIONS = ["list", "retrieve", "create", "update", "archive", "delete"];

export class PlanePageError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PlanePageError";
    this.status = status;
  }
}

const cookieJar = () => {
  const jar = new Map();
  return {
    absorb(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair, ...attrs] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const expired = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
        if (expired || value === "") jar.delete(name);
        else jar.set(name, value);
      }
    },
    get: (name) => jar.get(name),
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    clear: () => jar.clear(),
  };
};

const requireId = (value, label) => {
  if (typeof value !== "string" || !UUID.test(value)) throw new PlanePageError(`${label} must be a UUID`, 400);
  return value;
};

export function createPlanePages({baseUrl, workspaceSlug, email, password, fetch: fetchImpl = globalThis.fetch, sessionName = "session-id"}) {
  if (!baseUrl || !email || !password) throw new Error("Incomplete Plane page client configuration");
  if (!SLUG.test(workspaceSlug ?? "")) throw new Error("Invalid Plane workspace slug");
  const origin = new URL(baseUrl).origin;
  const jar = cookieJar();
  let signingIn = null;

  const baseHeaders = () => ({
    origin,
    referer: `${origin}/`,
    ...(jar.header() ? {cookie: jar.header()} : {}),
  });

  async function signIn() {
    jar.clear();
    const csrfResponse = await fetchImpl(`${origin}/auth/get-csrf-token/`, {headers: baseHeaders(), redirect: "manual"});
    jar.absorb(csrfResponse);
    const {csrf_token: csrf} = await csrfResponse.json();
    if (!csrf) throw new PlanePageError("Plane did not issue a CSRF token", 502);

    const response = await fetchImpl(`${origin}/auth/sign-in/`, {
      method: "POST",
      headers: {...baseHeaders(), "content-type": "application/x-www-form-urlencoded", "x-csrftoken": csrf},
      body: new URLSearchParams({csrfmiddlewaretoken: csrf, email, password, next_path: "/"}).toString(),
      redirect: "manual",
    });
    jar.absorb(response);
    // A failed sign-in also answers 302, with the reason in the query string; only a session cookie proves success.
    if (!jar.get(sessionName)) throw new PlanePageError("Plane sign-in for the page service account failed", 502);
  }

  const ensureSession = () => {
    if (jar.get(sessionName)) return Promise.resolve();
    signingIn ??= signIn().finally(() => {
      signingIn = null;
    });
    return signingIn;
  };

  async function call(method, path, body, retried = false) {
    await ensureSession();
    const headers = {...baseHeaders(), accept: "application/json", "x-csrftoken": jar.get("csrftoken") ?? ""};
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetchImpl(`${origin}/api/workspaces/${workspaceSlug}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    jar.absorb(response);
    if ((response.status === 401 || response.status === 403) && !retried) {
      jar.clear();
      return call(method, path, body, true);
    }
    if (response.status === 204) return {};
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {raw: text.slice(0, 200)};
    }
    if (!response.ok) {
      throw new PlanePageError(data?.error ?? data?.detail ?? `Plane returned HTTP ${response.status}`, response.status);
    }
    return data;
  }

  const pick = (source, keys) => Object.fromEntries(keys.filter((k) => source[k] !== undefined && source[k] !== "").map((k) => [k, source[k]]));

  return {
    /** Runs one `page` tool call. Returns the data Plane produced, or throws PlanePageError. */
    async run(args) {
      const action = args?.action;
      if (!PAGE_ACTIONS.includes(action)) {
        throw new PlanePageError(`page action "${action}" is not available on self-hosted Plane (supported: ${PAGE_ACTIONS.join(", ")})`, 400);
      }
      if (!args.project_id) {
        throw new PlanePageError("Workspace-level pages do not exist on self-hosted Plane; pass project_id", 400);
      }
      const project = requireId(args.project_id, "project_id");
      const pages = `projects/${project}/pages/`;

      if (action === "list") return call("GET", pages);
      if (action === "create") {
        if (!args.name) throw new PlanePageError("name is required", 400);
        if (args.parent_id !== undefined && args.parent_id !== null && args.parent_id !== "") {
          requireId(args.parent_id, "parent_id");
          throw new PlanePageError("Nested page creation with parent_id is not supported safely on Plane 1.4.2", 400);
        }
        const body = pick({name: args.name, description_html: args.description_html, color: args.color, parent: args.parent_id}, ["name", "description_html", "color", "parent"]);
        if (typeof args.access === "number") body.access = args.access;
        return call("POST", pages, body);
      }
      const page = requireId(args.page_id, "page_id");
      if (action === "retrieve") return call("GET", `${pages}${page}/`);
      if (action === "update") {
        const hasName = args.name !== undefined && args.name !== "";
        const hasHtml = args.description_html !== undefined;
        if (!hasName && !hasHtml) throw new PlanePageError("update needs name, description_html, or both", 400);
        if (hasName) await call("PATCH", `${pages}${page}/`, {name: args.name});
        if (!hasHtml) return {};
        const formats = documentFormatsFromHtml(args.description_html);
        return call("PATCH", `${pages}${page}/description/`, {
          description_binary: formats.description_binary,
          description_html: args.description_html,
          description_json: formats.description_json,
        });
      }
      if (action === "archive") return call(args.archive === false ? "DELETE" : "POST", `${pages}${page}/archive/`);
      return call("DELETE", `${pages}${page}/`);
    },
  };
}
