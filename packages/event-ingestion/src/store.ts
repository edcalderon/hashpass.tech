import {
  normalizedEventSchema,
  type NormalizedEvent,
  type SourceHealth,
} from "./schema.js";

export interface EventIngestionStore {
  loadEvents(sourceId: string): Promise<NormalizedEvent[]>;
  persistSync(input: {
    sourceId: string;
    attemptedAt: string;
    health: SourceHealth;
    events: NormalizedEvent[];
  }): Promise<void>;
}

export interface PostgrestEventStoreOptions {
  baseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export class PostgrestEventStore implements EventIngestionStore {
  private readonly fetcher: typeof fetch;
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: PostgrestEventStoreOptions) {
    if (!options.baseUrl || !options.serviceRoleKey) {
      throw new Error(
        "PostgREST event storage requires a base URL and service-role key",
      );
    }
    this.fetcher = options.fetchImpl || fetch;
    this.restUrl = `${withoutTrailingSlash(options.baseUrl)}/rest/v1`;
    this.timeoutMs = options.timeoutMs || 15_000;
    this.headers = {
      apikey: options.serviceRoleKey,
      Authorization: `Bearer ${options.serviceRoleKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await this.fetcher(`${this.restUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init.headers },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 500);
      throw new Error(`Event storage responded ${response.status}: ${message}`);
    }
    return response;
  }

  async loadEvents(sourceId: string): Promise<NormalizedEvent[]> {
    const query = new URLSearchParams({
      select: "normalized_payload",
      source_id: `eq.${sourceId}`,
      order: "external_id.asc",
    });
    const response = await this.request(`/external_events?${query}`);
    const rows = (await response.json()) as Array<{
      normalized_payload: unknown;
    }>;
    return rows.map((row) =>
      normalizedEventSchema.parse(row.normalized_payload),
    );
  }

  async persistSync(input: {
    sourceId: string;
    attemptedAt: string;
    health: SourceHealth;
    events: NormalizedEvent[];
  }): Promise<void> {
    await this.request("/rpc/ingest_event_source_sync", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        p_source_id: input.sourceId,
        p_attempted_at: input.attemptedAt,
        p_status: input.health.status,
        p_error: input.health.error || null,
        p_events: input.events,
      }),
    });
  }
}
