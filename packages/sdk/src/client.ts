import { AuthQrClient } from "./auth-qr/client.js";
import { HashpassAuth, MemorySessionStore } from "./auth/client.js";
import { HashpassError } from "./errors.js";
import { QrLinksClient } from "./qr-links/client.js";
import { SupportClient } from "./support/client.js";
import { HttpTransport } from "./transport.js";
import type { HashpassEnvironment, HashpassSdkOptions } from "./types.js";

const ENVIRONMENT_URLS: Record<HashpassEnvironment, string> = {
  production: "https://api.hashpass.tech/",
  development: "https://api-dev.hashpass.tech/",
  local: "http://localhost:8055/",
};

export class HashpassClient {
  readonly support: SupportClient;
  readonly auth: HashpassAuth;
  /** "HashPass Auth": passwordless QR login, backed by a separate service -- see linksApiBaseUrl. */
  readonly authQr: AuthQrClient;
  /** "HashPass Links": custom/trackable QR link creation and management, backed by the same service as authQr -- see linksApiBaseUrl. */
  readonly qrLinks: QrLinksClient;

  constructor(options: HashpassSdkOptions) {
    validateOptions(options);
    // Binding matters: every transport stores this on a private #options
    // field and later invokes it as `this.#options.fetch(...)` -- a method
    // call on an object that is not `window`/`globalThis`. Browsers'
    // native fetch is a "needs receiver" Web IDL operation, so calling the
    // unbound reference that way throws "TypeError: Failed to execute
    // 'fetch' on 'Window': Illegal invocation". This is invisible to every
    // test that passes its own mock `fetch` (a plain function has no such
    // receiver requirement) -- it only fires on the real default path,
    // i.e. exactly what every app not overriding `fetch` actually hits.
    const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImplementation) {
      throw new HashpassError("A Fetch API implementation is required", { code: "configuration_error" });
    }
    const shared = {
      baseUrl: options.baseUrl ?? ENVIRONMENT_URLS[options.environment ?? "production"],
      appId: options.appId,
      fetch: fetchImplementation,
      headers: options.headers,
      timeoutMs: options.timeoutMs ?? 15_000,
      retry: options.retry,
    };
    const authTransport = new HttpTransport(shared);
    this.auth = new HashpassAuth(authTransport, options.sessionStore ?? new MemorySessionStore());
    const resolvedAuth = options.auth ?? this.auth;
    const transport = new HttpTransport({ ...shared, auth: resolvedAuth });
    this.support = new SupportClient(transport);
    this.authQr = new AuthQrClient({
      baseUrl: options.linksApiBaseUrl,
      appId: options.appId,
      fetch: fetchImplementation,
      headers: options.headers,
      timeoutMs: options.timeoutMs ?? 15_000,
      auth: resolvedAuth,
    });
    this.qrLinks = new QrLinksClient({
      baseUrl: options.linksApiBaseUrl,
      appId: options.appId,
      fetch: fetchImplementation,
      headers: options.headers,
      timeoutMs: options.timeoutMs ?? 15_000,
      auth: resolvedAuth,
    });
  }
}

function validateOptions(options: HashpassSdkOptions): void {
  if (!options.appId?.trim()) {
    throw new HashpassError("appId is required", { code: "configuration_error" });
  }
  if (options.baseUrl) {
    try { new URL(options.baseUrl); } catch (cause) {
      throw new HashpassError("baseUrl must be an absolute URL", { code: "configuration_error", cause });
    }
  }
}

export function createHashpass(options: HashpassSdkOptions): HashpassClient {
  return new HashpassClient(options);
}
