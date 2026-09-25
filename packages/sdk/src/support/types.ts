import type { Page } from "../types.js";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type MessageAuthor = "customer" | "ai" | "agent" | "system";
export type SupportLocale = "en" | "es" | (string & {});
export type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface SupportIdentity {
  externalId?: string;
  email?: string;
  name?: string;
  locale?: string;
  traits?: Record<string, string | number | boolean | null>;
}

export interface SupportContext {
  appVersion?: string;
  platform?: "web" | "ios" | "android" | "cli" | string;
  url?: string;
  device?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  author: MessageAuthor;
  body: string;
  createdAt: string;
  attachments?: SupportAttachment[];
  deliveryStatus?: "queued" | "sent" | "delivered" | "failed";
}

export interface ListMessagesInput {
  cursor?: string;
  limit?: number;
}

export type MessagePage = Page<SupportMessage>;

export interface SupportEventPage {
  items: SupportEvent[];
  nextCursor?: string;
}

export interface SupportSession {
  token: string;
  visitorId: string;
  applicationId: string;
  expiresAt: string;
}

export interface WidgetConfiguration {
  appId: string;
  locale: SupportLocale;
  position: WidgetPosition;
  greeting: string;
  apiBaseUrl?: string;
  theme?: {
    color?: string;
    logoUrl?: string;
    launcherIconUrl?: string;
  };
  features?: Record<string, boolean>;
}

export interface MarkTicketReadInput { cursor?: string; idempotencyKey?: string }

export interface SupportAttachment {
  id: string;
  name: string;
  contentType: string;
  url: string;
  size?: number;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  identity?: SupportIdentity;
  context?: SupportContext;
  latestMessage?: SupportMessage;
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  priority?: TicketPriority;
  identity?: SupportIdentity;
  context?: SupportContext;
  /** Start with the AI assistant when available. Defaults to true. */
  aiAssistance?: boolean;
  idempotencyKey?: string | undefined;
}

export interface SendMessageInput {
  body: string;
  idempotencyKey?: string | undefined;
}

export interface ListTicketsInput {
  status?: TicketStatus;
  cursor?: string;
  limit?: number;
}

export type TicketPage = Page<SupportTicket>;

export type SupportEvent =
  | { type: "ticket.updated"; cursor: string; ticket: SupportTicket }
  | { type: "message.created"; cursor: string; message: SupportMessage }
  | { type: "agent.joined"; cursor: string; ticketId: string; agent: { id: string; name: string } }
  | { type: "typing.started" | "typing.stopped"; cursor: string; ticketId: string; author: MessageAuthor };

export interface IdentifySupportVisitorInput extends SupportIdentity {
  idempotencyKey?: string;
}

export interface WatchTicketOptions {
  cursor?: string;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}
