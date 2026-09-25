import {
  createHashpass,
  type HashpassClient,
  type SupportIdentity,
  type SupportMessage,
  type SupportSession,
  type SupportTicket,
} from "@hashpass-tech/sdk";
import { consumeExistingSupportEvents } from "./event-cursor.js";

export type HashpassSupportEvent =
  | "ready" | "opened" | "closed" | "ticket.created" | "message.created" | "unread.changed" | "handoff.requested" | "error";
export interface HashpassSupportConfig {
  appId: string;
  locale?: "en" | "es" | string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  greeting?: string;
  apiBaseUrl?: string;
  theme?: { color?: string; logoUrl?: string; launcherIconUrl?: string };
}

type Listener = (payload?: unknown) => void;
const labels = {
  en: { open: "Open support", close: "Close support", title: "HashPass Support", start: "Start a conversation", message: "How can we help?", send: "Send", reply: "Reply", requestHuman: "Talk to a human" },
  es: { open: "Abrir soporte", close: "Cerrar soporte", title: "Soporte de HashPass", start: "Iniciar una conversación", message: "¿Cómo podemos ayudarte?", send: "Enviar", reply: "Responder", requestHuman: "Hablar con una persona" },
} as const;

function sessionStorageKey(appId: string): string {
  return `hashpass.support.session:${appId}`;
}
function ticketStorageKey(appId: string): string {
  return `hashpass.support.ticket:${appId}`;
}

/**
 * Bootstraps a support session before any ticket work happens (matches the
 * server: POST /v1/support/tickets requires a session bearer token -- see
 * apps/mobile-app/lib/server/support-session.ts). Persisted in localStorage
 * so a page reload doesn't lose the visitor's identity or their open ticket;
 * the SDK's own in-memory session store (packages/sdk/src/auth/client.ts)
 * does not survive a reload on its own.
 */
export class HashpassSupportElement extends HTMLElement {
  static observedAttributes = ["app-id", "locale", "position", "greeting", "api-base-url"];
  #listeners = new Map<HashpassSupportEvent, Set<Listener>>();
  #open = false;
  #ticket?: SupportTicket;
  #messages: SupportMessage[] = [];
  #loading = false;
  #sending = false;
  #root = this.attachShadow({ mode: "open" });
  #client?: HashpassClient;
  #clientKey?: string;
  #pollController?: AbortController;
  #bootstrapPromise?: Promise<void>;

  connectedCallback(): void {
    this.render();
    this.emit("ready");
    this.#bootstrapPromise = this.#bootstrap();
  }

  disconnectedCallback(): void {
    this.#pollController?.abort();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  open(): void {
    this.#open = true;
    this.render();
    this.emit("opened");
    void this.#bootstrapPromise?.then(() => this.#startPolling());
  }

  close(): void {
    this.#open = false;
    this.#pollController?.abort();
    this.render();
    this.emit("closed");
  }

  toggle(): void {
    this.#open ? this.close() : this.open();
  }

  async identify(identity: SupportIdentity): Promise<SupportSession> {
    await this.#bootstrapPromise;
    const session = await this.#getClient().support.identifySupportVisitor(identity);
    this.#persistSession(session);
    return session;
  }

  reset(): void {
    this.#ticket = undefined;
    this.#messages = [];
    localStorage.removeItem(ticketStorageKey(this.#config().appId));
    this.render();
  }

  async createTicket(input: { subject: string; message: string }): Promise<SupportTicket> {
    await this.#bootstrapPromise;
    const ticket = await this.#getClient().support.createTicket({
      ...input,
      context: { platform: "web", url: globalThis.location?.href },
    });
    this.#ticket = ticket;
    this.#messages = [{ id: `local:${Date.now()}`, ticketId: ticket.id, author: "customer", body: input.message, createdAt: ticket.createdAt }];
    localStorage.setItem(ticketStorageKey(this.#config().appId), ticket.id);
    this.emit("ticket.created", ticket);
    this.render();
    if (this.#open) this.#startPolling();
    return ticket;
  }

  async sendMessage(body: string): Promise<SupportMessage | undefined> {
    if (!this.#ticket || !body.trim() || this.#sending) return undefined;
    this.#sending = true;
    this.render();
    try {
      const message = await this.#getClient().support.sendMessage(this.#ticket.id, { body });
      this.#messages = [...this.#messages, message];
      this.emit("message.created", message);
      return message;
    } catch (error) {
      this.emit("error", error);
      return undefined;
    } finally {
      this.#sending = false;
      this.render();
    }
  }

  async requestHuman(): Promise<void> {
    if (!this.#ticket) return;
    try {
      this.#ticket = await this.#getClient().support.requestHuman(this.#ticket.id);
      this.emit("handoff.requested", this.#ticket);
      this.render();
    } catch (error) {
      this.emit("error", error);
    }
  }

  on(event: HashpassSupportEvent, callback: Listener): void {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(callback);
    this.#listeners.set(event, set);
  }
  off(event: HashpassSupportEvent, callback: Listener): void {
    this.#listeners.get(event)?.delete(callback);
  }

  async #bootstrap(): Promise<void> {
    const { appId } = this.#config();
    if (!appId) return;

    const client = this.#getClient();
    const stored = this.#readStoredSession(appId);
    try {
      if (stored) {
        await client.support.adoptSupportSession(stored);
      } else {
        const session = await client.support.createSupportSession();
        this.#persistSession(session);
      }
    } catch (error) {
      this.emit("error", error);
      return;
    }

    const ticketId = localStorage.getItem(ticketStorageKey(appId));
    if (!ticketId) return;

    this.#loading = true;
    this.render();
    try {
      this.#ticket = await client.support.getTicket(ticketId);
      const page = await client.support.listMessages(ticketId, { limit: 50 });
      this.#messages = page.items;
    } catch {
      // Ticket may have expired/been deleted server-side; drop the stale reference.
      localStorage.removeItem(ticketStorageKey(appId));
      this.#ticket = undefined;
      this.#messages = [];
    } finally {
      this.#loading = false;
      this.render();
    }
  }

  async #startPolling(): Promise<void> {
    this.#pollController?.abort();
    if (!this.#ticket) return;
    const controller = new AbortController();
    this.#pollController = controller;
    const ticketId = this.#ticket.id;

    try {
      // The ticket and message history were loaded during bootstrap. Drain the
      // matching event history silently, then poll only for subsequent events.
      // Otherwise every reopen turns old agent replies into new notifications.
      const cursor = await consumeExistingSupportEvents(
        (eventCursor) => this.#getClient().support.getTicketEvents(ticketId, eventCursor, controller.signal),
        controller.signal,
      );
      if (controller.signal.aborted || this.#pollController !== controller) return;
      void this.#pollLoop(ticketId, cursor, controller.signal);
    } catch {
      // Do not fall back to an undefined cursor: that would replay history as
      // fresh events. Retry the silent catch-up instead.
      if (!controller.signal.aborted) {
        setTimeout(() => {
          if (this.#pollController === controller) void this.#startPolling();
        }, 3_000);
      }
    }
  }

  async #pollLoop(ticketId: string, initialCursor: string | undefined, signal: AbortSignal): Promise<void> {
    const client = this.#getClient();
    let cursor = initialCursor;
    while (!signal.aborted) {
      try {
        const page = await client.support.getTicketEvents(ticketId, cursor, signal);
        for (const event of page.items) {
          cursor = event.cursor;
          if (event.type === "message.created" && event.message.author !== "customer") {
            this.#messages = [...this.#messages.filter((m) => m.id !== event.message.id), event.message];
            this.emit("message.created", event.message);
            this.emit("unread.changed", this.#messages.length);
            this.render();
          }
          if (event.type === "ticket.updated") {
            this.#ticket = event.ticket;
            this.render();
          }
        }
        cursor = page.nextCursor ?? cursor;
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }

  #persistSession(session: SupportSession): void {
    localStorage.setItem(sessionStorageKey(session.applicationId), JSON.stringify(session));
  }

  #readStoredSession(appId: string): SupportSession | null {
    try {
      const raw = localStorage.getItem(sessionStorageKey(appId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SupportSession;
      if (!parsed?.token || Date.parse(parsed.expiresAt) <= Date.now() + 30_000) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  #config(): HashpassSupportConfig {
    const appId = this.getAttribute("app-id") || document.currentScript?.getAttribute("data-hashpass-app-id") || "";
    if (!appId) this.emit("error", new Error("app-id is required"));
    return {
      appId,
      locale: this.getAttribute("locale") ?? "en",
      position: (this.getAttribute("position") as HashpassSupportConfig["position"]) ?? "bottom-right",
      greeting: this.getAttribute("greeting") ?? undefined,
      apiBaseUrl: this.getAttribute("api-base-url") ?? undefined,
    };
  }

  #getClient(): HashpassClient {
    const c = this.#config();
    const key = `${c.appId}::${c.apiBaseUrl ?? ""}`;
    if (!this.#client || this.#clientKey !== key) {
      this.#client = createHashpass({ appId: c.appId, baseUrl: c.apiBaseUrl });
      this.#clientKey = key;
    }
    return this.#client;
  }

  private emit(event: HashpassSupportEvent, payload?: unknown): void {
    this.#listeners.get(event)?.forEach((cb) => cb(payload));
    this.dispatchEvent(new CustomEvent(event, { detail: payload }));
  }

  private render(): void {
    const c = this.#config();
    const l = labels[c.locale === "es" ? "es" : "en"];
    const color = c.theme?.color ?? "#06b6d4";
    const hasTicket = Boolean(this.#ticket);
    this.#root.innerHTML = `<style>
      :host{position:fixed;z-index:2147483000;${c.position?.includes("top") ? "top" : "bottom"}:20px;${c.position?.includes("left") ? "left" : "right"}:20px;font-family:Inter,system-ui,sans-serif}
      .launcher,.send,.secondary{min-width:44px;min-height:44px;border:0;border-radius:999px;background:${color};color:#001018;font-weight:700;box-shadow:0 10px 30px #0003;cursor:pointer}
      .secondary{background:transparent;border:1px solid ${color};color:${color}}
      .panel{width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 96px));background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:20px;box-shadow:0 24px 80px #0004;display:flex;flex-direction:column;overflow:hidden}
      .head{background:#07141f;color:#fff;padding:16px;display:flex;justify-content:space-between;align-items:center;flex:0 0 auto}
      .thread{padding:16px;flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px}
      .msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap}
      .msg.customer{align-self:flex-end;background:${color};color:#001018}
      .msg.agent,.msg.ai,.msg.system{align-self:flex-start;background:#f1f5f9;color:#111827}
      .composer{padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:8px;flex:0 0 auto}
      .row{display:flex;gap:8px}
      .sr{position:absolute;left:-9999px}
      .focus:focus,.launcher:focus,.send:focus,.secondary:focus,textarea:focus{outline:3px solid #facc15;outline-offset:2px}
      textarea{width:100%;min-height:44px;max-height:120px;flex:1;resize:vertical;border-radius:8px;border:1px solid #d1d5db;padding:8px}
      p.hint{margin:0;font-size:12px;color:#6b7280}
    </style>
    <div aria-live="polite" class="sr">${this.#messages.length ? `${this.#messages.length} messages` : ""}</div>
    ${this.#open ? this.#renderPanel(c, l, hasTicket) : `<button class="launcher" id="open" aria-label="${l.open}">?</button>`}`;

    this.#root.getElementById("open")?.addEventListener("click", () => this.open());
    this.#root.getElementById("close")?.addEventListener("click", () => this.close());
    this.#root.getElementById("human")?.addEventListener("click", () => void this.requestHuman());
    this.#root.getElementById("send")?.addEventListener("click", () => {
      const textarea = this.#root.getElementById("msg") as HTMLTextAreaElement | null;
      const body = textarea?.value?.trim();
      if (!body) return;
      if (textarea) textarea.value = "";
      if (this.#ticket) {
        void this.sendMessage(body);
      } else {
        void this.createTicket({ subject: body.slice(0, 80), message: body }).catch((e) => this.emit("error", e));
      }
    });

    const thread = this.#root.querySelector(".thread");
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  #renderPanel(c: HashpassSupportConfig, l: (typeof labels)[keyof typeof labels], hasTicket: boolean): string {
    const status = this.#loading
      ? "…"
      : hasTicket
        ? this.#messages
            .map((m) => `<div class="msg ${m.author}">${escapeHtml(m.body)}</div>`)
            .join("")
        : `<p>${c.greeting ?? l.message}</p>`;

    return `<section class="panel" role="dialog" aria-modal="false" aria-label="${l.title}">
      <div class="head">
        <strong>${l.title}${this.#ticket ? ` — #${this.#ticket.id.slice(0, 8)} (${this.#ticket.status})` : ""}</strong>
        <button class="focus" id="close" aria-label="${l.close}">×</button>
      </div>
      <div class="thread">${status}</div>
      <div class="composer">
        <div class="row">
          <textarea id="msg" aria-label="${l.message}" placeholder="${hasTicket ? l.reply : l.message}"></textarea>
          <button class="send focus" id="send" ${this.#sending ? "disabled" : ""}>${hasTicket ? l.send : l.start}</button>
        </div>
        ${hasTicket && this.#ticket?.status !== "resolved" ? `<button class="secondary focus" id="human">${l.requestHuman}</button>` : ""}
        <p class="hint">Privacy notice: do not include secrets or payment details.</p>
      </div>
    </section>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

export function defineHashpassSupport(tag = "hashpass-support"): void {
  if (!customElements.get(tag)) customElements.define(tag, HashpassSupportElement);
}
defineHashpassSupport();

declare global {
  interface Window {
    HashpassSupport?: HashpassSupportElement;
  }
}
