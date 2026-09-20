import {
  createHashpass,
  type AuthSession,
  type AuthSessionStore,
  type HashpassSdkOptions,
  type SupportContext,
  type SupportTicket,
} from "@hashpass-tech/sdk";
import { Platform } from "react-native";

export interface SecureSupportSessionStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface NativeSupportControllerOptions extends HashpassSdkOptions {
  secureStore: SecureSupportSessionStore;
  pollIntervalMs?: number;
}

export class NativeSupportController {
  readonly sdk;
  constructor(readonly options: NativeSupportControllerOptions) {
    const supportSessionStore: AuthSessionStore = {
      get: async () => {
        const value = await options.secureStore.getItem(
          "hashpass.support.session",
        );
        return value ? (JSON.parse(value) as AuthSession) : null;
      },
      set: (session) =>
        options.secureStore.setItem(
          "hashpass.support.session",
          JSON.stringify(session),
        ),
      clear: () => options.secureStore.deleteItem("hashpass.support.session"),
    };
    this.sdk = createHashpass({ ...options, supportSessionStore });
  }
  async createTicket(input: {
    subject: string;
    message: string;
    context?: Partial<SupportContext>;
  }): Promise<SupportTicket> {
    const { context, ...rest } = input;
    // Platform.OS is the real caller platform (ios/android/web/...) --
    // context still allows a caller to override or extend it (device info,
    // metadata) rather than hard-coding a single OS for every consumer of
    // this cross-platform controller.
    await this.sdk.support.ensureSession();
    return this.sdk.support.createTicket({
      ...rest,
      context: { platform: Platform.OS, ...context },
    });
  }
  async rememberActiveTicket(ticketId: string): Promise<void> {
    await this.options.secureStore.setItem(
      "hashpass.support.activeTicketId",
      ticketId,
    );
  }
  getActiveTicketId(): Promise<string | null> {
    return this.options.secureStore.getItem("hashpass.support.activeTicketId");
  }
  clearActiveTicket(): Promise<void> {
    return this.options.secureStore.deleteItem(
      "hashpass.support.activeTicketId",
    );
  }
}
