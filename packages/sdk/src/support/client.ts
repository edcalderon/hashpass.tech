import type { HttpTransport } from "../transport.js";
import type {
  CreateTicketInput,
  ListTicketsInput,
  SendMessageInput,
  SupportEvent,
  SupportMessage,
  SupportTicket,
  TicketPage,
  WatchTicketOptions,
} from "./types.js";

export class SupportClient {
  constructor(private readonly transport: HttpTransport) {}

  createTicket(input: CreateTicketInput): Promise<SupportTicket> {
    const { idempotencyKey, ...body } = input;
    return this.transport.request("v1/support/tickets", {
      method: "POST",
      body: { aiAssistance: true, ...body },
      idempotencyKey,
    });
  }

  getTicket(ticketId: string): Promise<SupportTicket> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}`);
  }

  listTickets(input: ListTicketsInput = {}): Promise<TicketPage> {
    return this.transport.request("v1/support/tickets", {
      query: { status: input.status, cursor: input.cursor, limit: input.limit },
    });
  }

  sendMessage(ticketId: string, input: SendMessageInput): Promise<SupportMessage> {
    const { idempotencyKey, ...body } = input;
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: "POST",
      body,
      idempotencyKey,
    });
  }

  requestHuman(ticketId: string): Promise<SupportTicket> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}/handoff`, {
      method: "POST",
      body: {},
      idempotencyKey: `handoff:${ticketId}`,
    });
  }

  resolveTicket(ticketId: string): Promise<SupportTicket> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      body: { status: "resolved" },
      idempotencyKey: `resolve:${ticketId}`,
    });
  }

  /**
   * Portable event stream implemented with cursor polling so it works in browsers,
   * React Native, server runtimes, and the CLI without a WebSocket dependency.
   */
  async *watchTicket(ticketId: string, options: WatchTicketOptions = {}): AsyncGenerator<SupportEvent> {
    let cursor = options.cursor;
    const interval = options.pollIntervalMs ?? 1_500;
    while (!options.signal?.aborted) {
      const page = await this.transport.request<{ items: SupportEvent[]; nextCursor?: string }>(
        `v1/support/tickets/${encodeURIComponent(ticketId)}/events`,
        { query: { cursor }, signal: options.signal },
      );
      for (const event of page.items) {
        cursor = event.cursor;
        yield event;
      }
      cursor = page.nextCursor ?? cursor;
      if (page.items.length === 0) await wait(interval, options.signal);
    }
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
}
