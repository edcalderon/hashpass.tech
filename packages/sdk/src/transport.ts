import { HashpassError, type HashpassErrorCode } from "./errors.js";
import type { AuthProvider, RequestOptions, RetryPolicy } from "./types.js";

const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseDelayMs: 250, maxDelayMs: 2_000 };

export interface TransportOptions {
  baseUrl: string;
  appId: string;
  fetch: typeof globalThis.fetch;
  headers?: Record<string, string> | undefined;
  timeoutMs: number;
  retry?: Partial<RetryPolicy> | undefined;
  auth?: AuthProvider | undefined;
}

export class HttpTransport {
  readonly #options: TransportOptions;
  readonly #retry: RetryPolicy;

  constructor(options: TransportOptions) {
    this.#options = options;
    this.#retry = { ...DEFAULT_RETRY, ...options.retry };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    const method = options.method ?? "GET";
    const canRetry = method === "GET" || method === "DELETE" || Boolean(options.idempotencyKey);
    let lastError: unknown;

    for (let attempt = 0; attempt < (canRetry ? this.#retry.attempts : 1); attempt += 1) {
      try {
        const response = await this.#send(path, options);
        if (canRetry && isRetryable(response.status) && attempt + 1 < this.#retry.attempts) {
          await delay(backoff(attempt, this.#retry), options.signal);
          continue;
        }
        return await parseResponse<T>(response);
      } catch (error) {
        if (error instanceof HashpassError && error.code !== "network_error") throw error;
        lastError = error;
        if (!canRetry || attempt + 1 >= this.#retry.attempts) break;
        await delay(backoff(attempt, this.#retry), options.signal);
      }
    }

    if (lastError instanceof HashpassError) throw lastError;
    throw new HashpassError("Unable to reach Hashpass", { code: "network_error", cause: lastError });
  }

  async #send(path: string, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("request timed out")), this.#options.timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort(options.signal.reason);

    try {
      const token = options.authenticated === false ? null : await this.#options.auth?.getAccessToken();
      const headers = new Headers(this.#options.headers);
      headers.set("accept", "application/json");
      headers.set("x-hashpass-app-id", this.#options.appId);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (options.body !== undefined) headers.set("content-type", "application/json");
      if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
      for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);

      const requestInit: RequestInit = {
        method: options.method ?? "GET",
        headers,
        signal: controller.signal,
      };
      if (options.body !== undefined) requestInit.body = JSON.stringify(options.body);
      const response = await this.#options.fetch(buildUrl(this.#options.baseUrl, path, options.query), requestInit);
      if (response.status === 401) await this.#options.auth?.onUnauthorized?.();
      return response;
    } catch (error) {
      // A caller abort is an intentional cancellation, not a transport
      // deadline. Preserve the original AbortError so watchTicket callers can
      // stop polling without triggering timeout telemetry or retries.
      if (options.signal?.aborted) throw error;
      if (controller.signal.aborted) {
        throw new HashpassError("Hashpass request timed out or was cancelled", { code: "timeout", cause: error });
      }
      throw new HashpassError("Unable to reach Hashpass", { code: "network_error", cause: error });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (response.ok) return body as T;

  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const message = typeof value.message === "string" ? value.message : `Hashpass API returned ${response.status}`;
  throw new HashpassError(message, {
    code: statusCode(response.status),
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
    details: value.details ?? body,
  });
}

function statusCode(status: number): HashpassErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422 || status === 400) return "validation_error";
  if (status === 429) return "rate_limited";
  return "api_error";
}

function isRetryable(status: number): boolean { return status === 408 || status === 429 || status >= 500; }
function backoff(attempt: number, policy: RetryPolicy): number {
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** attempt));
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timeout); reject(signal.reason); }, { once: true });
  });
}
