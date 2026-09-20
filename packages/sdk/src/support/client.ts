import type { HashpassAuth } from "../auth/client.js";
import type { HttpTransport } from "../transport.js";
import type {
  CreateTicketInput,
  ListMessagesInput,
  ListTicketsInput,
  MarkTicketReadInput,
  MessagePage,
  SendMessageInput,
  SupportEvent,
  SupportEventPage,
  SupportMessage,
  SupportSession,
  SupportTicket,
  TicketPage,
  WidgetConfiguration,
  IdentifySupportVisitorInput,
  WatchTicketOptions,
} from "./types.js";

export class SupportClient {
  constructor(private readonly transport: HttpTransport, private readonly auth?: HashpassAuth) {}

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

  async createSupportSession(): Promise<SupportSession> {
    const session = await this.transport.request<SupportSession>("v1/support/sessions", {
      method: "POST",
      body: {},
      authenticated: false,
    });
    await this.auth?.adoptSupportSession(session);
    return session;
  }

  getWidgetConfiguration(appId?: string): Promise<WidgetConfiguration> {
    return this.transport.request("v1/support/widget-config", { query: { appId }, authenticated: false });
  }

  async identifySupportVisitor(input: IdentifySupportVisitorInput): Promise<SupportSession> {
    const { idempotencyKey, ...body } = input;
    const session = await this.transport.request<SupportSession>("v1/support/sessions", {
      method: "POST",
      body: { identity: body },
      idempotencyKey,
    });
    await this.auth?.adoptSupportSession(session);
    return session;
  }

  listMessages(ticketId: string, input: ListMessagesInput = {}): Promise<MessagePage> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
      query: { cursor: input.cursor, limit: input.limit },
    });
  }

  getTicketEvents(ticketId: string, cursor?: string, signal?: AbortSignal): Promise<SupportEventPage> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}/events`, { query: { cursor }, signal });
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

  markTicketRead(ticketId: string, input: MarkTicketReadInput = {}): Promise<SupportTicket> {
    const { idempotencyKey, ...body } = input;
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}/read`, {
      method: "POST",
      body,
      idempotencyKey: idempotencyKey ?? `read:${ticketId}:${input.cursor ?? "latest"}`,
    });
  }

  reopenTicket(ticketId: string): Promise<SupportTicket> {
    return this.transport.request(`v1/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      body: { status: "open" },
      idempotencyKey: `reopen:${ticketId}`,
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
      const page = await this.getTicketEvents(ticketId, cursor, options.signal);
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
