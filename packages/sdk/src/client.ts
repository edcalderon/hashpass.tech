import { HashpassAuth, MemorySessionStore } from "./auth/client.js";
import { HashpassError } from "./errors.js";
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

  constructor(options: HashpassSdkOptions) {
    validateOptions(options);
    const fetchImplementation = options.fetch ?? globalThis.fetch;
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
    const transport = new HttpTransport({ ...shared, auth: options.auth ?? this.auth });
    this.support = new SupportClient(transport);
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
