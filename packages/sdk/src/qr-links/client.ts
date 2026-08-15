import { HashpassError } from "../errors.js";
import { HttpTransport } from "../transport.js";
import type { AuthProvider } from "../types.js";
import type {
  CreateQrLinkInput,
  QrLink,
  QrLinkAnalytics,
  QrSlugAvailability,
  UpdateQrLinkInput,
} from "./types.js";

export interface QrLinksClientOptions {
  appId: string;
  fetch: typeof globalThis.fetch;
  /** Base URL of the HashPass Links API (hashpass.link) -- same service AuthQrClient talks to, see its own baseUrl option for why this has no stable default yet. */
  baseUrl?: string | undefined;
  timeoutMs: number;
  headers?: Record<string, string> | undefined;
  auth?: AuthProvider | undefined;
}

interface QrLinksListResponse {
  links: QrLink[];
}

// "HashPass Links": custom, trackable QR codes an admin creates for an
// event or campaign -- create, edit, pause/resume/archive, and see scan
// counts. Every route here requires the caller's own authenticated session
// (unlike AuthQrClient's browser-side calls, which are deliberately
// anonymous) -- see packages/hashpass-links-api/src/routes/qr-links.ts.
export class QrLinksClient {
  #options: QrLinksClientOptions;
  #transport: HttpTransport | undefined;

  constructor(options: QrLinksClientOptions) {
    this.#options = options;
  }

  #transportOrThrow(): HttpTransport {
    if (!this.#options.baseUrl) {
      throw new HashpassError(
        "HashPass Links (QR link management) requires linksApiBaseUrl to be configured on the Hashpass SDK client",
        { code: "configuration_error" },
      );
    }
    if (!this.#transport) {
      this.#transport = new HttpTransport({
        baseUrl: this.#options.baseUrl,
        appId: this.#options.appId,
        fetch: this.#options.fetch,
        headers: this.#options.headers,
        timeoutMs: this.#options.timeoutMs,
        auth: this.#options.auth,
      });
    }
    return this.#transport;
  }

  /** Creates a new custom QR link, owned by the caller. */
  async create(input: CreateQrLinkInput): Promise<QrLink> {
    return this.#transportOrThrow().request<QrLink>("api/v1/qr-links", { method: "POST", body: input });
  }

  /** Lists every QR link the caller owns, newest-updated first. */
  async list(): Promise<QrLink[]> {
    const response = await this.#transportOrThrow().request<QrLinksListResponse>("api/v1/qr-links");
    return response.links;
  }

  /** Fetches one QR link the caller owns. */
  async get(id: string): Promise<QrLink> {
    return this.#transportOrThrow().request<QrLink>(`api/v1/qr-links/${encodeURIComponent(id)}`);
  }

  /** Checks a proposed custom short-link name before saving; the API's unique constraint remains authoritative. */
  async slugAvailability(slug: string): Promise<QrSlugAvailability> {
    return this.#transportOrThrow().request<QrSlugAvailability>(`api/v1/qr-links/slug-availability?slug=${encodeURIComponent(slug)}`);
  }

  /** Edits a QR link's fields, or transitions its lifecycle status (pause/resume/archive) -- both go through the same PATCH since every field is optional. */
  async update(id: string, input: UpdateQrLinkInput): Promise<QrLink> {
    return this.#transportOrThrow().request<QrLink>(`api/v1/qr-links/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    });
  }

  /** Removes a QR link from management and disables its public redirect. */
  async delete(id: string): Promise<void> {
    await this.#transportOrThrow().request<void>(`api/v1/qr-links/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /** Scan counts and device/bot breakdown for one QR link, over the trailing window the API reports (`windowDays` on the response). */
  async analytics(id: string): Promise<QrLinkAnalytics> {
    return this.#transportOrThrow().request<QrLinkAnalytics>(`api/v1/qr-links/${encodeURIComponent(id)}/analytics`);
  }
}
