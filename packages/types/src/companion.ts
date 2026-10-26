/**
 * Contracts for the HASHPASS Muse Companion orchestration boundary.
 * These describe untrusted model output and server-side action context; they
 * do not make a capability callable or replace runtime validation.
 */

export type PermissionTier = "read" | "navigate" | "propose_write";

/** Only user-facing, allowlisted capabilities may be described to the model. */
export type CompanionCapabilityId =
  | "get_my_events"
  | "get_event_details"
  | "get_readiness"
  | "show_my_original_ticket"
  | "navigate_to_event_or_schedule"
  | "propose_import_source";

export type ToolPropertySchema = {
  type: "string" | "number" | "boolean";
  description?: string;
  enum?: readonly string[];
};

export interface ToolDescriptor {
  id: CompanionCapabilityId;
  description: string;
  permission: PermissionTier;
  inputSchema: {
    type: "object";
    properties: Record<string, ToolPropertySchema>;
    required?: readonly string[];
    additionalProperties: false;
  };
}

/** Model-provided tool arguments remain unknown until validated by the server. */
export interface AgentToolCall {
  id: string;
  capabilityId: CompanionCapabilityId;
  arguments: unknown;
}

export type AgentTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AgentToolCall[] }
  | {
      role: "tool";
      toolCallId: string;
      capabilityId: CompanionCapabilityId;
      result: ActionResult;
    };

/** Input from the app. Identity and authorization are resolved server-side. */
export interface AgentRequest {
  requestId: string;
  channel: "text" | "voice_transcript";
  text: string;
  locale: string;
  turns?: AgentTurn[];
}

/** Constructed only after the app server validates the active user session. */
export interface ActionContext {
  requestId: string;
  userId: string;
  locale: string;
  createdAt: string;
}

/** Opaque marker type; a real confirmation token must be generated and checked server-side. */
export type ConfirmationToken = string & {
  readonly __confirmationToken: unique symbol;
};

export interface ActionProposal {
  proposalId: string;
  capabilityId: "propose_import_source";
  userId: string;
  summary: string;
  arguments: unknown;
  confirmationToken: ConfirmationToken;
  evidence: {
    sourceDocumentId: string;
    citationText?: string | null;
    pageOrRegion?: string | null;
  }[];
  expiresAt: string;
}

/** Safe to return in a model tool result; contains no owner ID or confirmation secret. */
export interface ActionProposalView {
  proposalId: string;
  summary: string;
  evidence: ActionProposal["evidence"];
  expiresAt: string;
}

/** Sent only by the app's explicit confirmation flow, never as a model tool call. */
export interface ConfirmActionRequest {
  proposalId: string;
  confirmationToken: ConfirmationToken;
}

export type ActionResult =
  | { status: "succeeded"; summary: string; data?: unknown }
  | { status: "needs_confirmation"; proposal: ActionProposalView }
  | {
      status: "rejected";
      code: "not_allowed" | "invalid_arguments" | "not_found" | "expired";
      summary: string;
    }
  | {
      status: "failed";
      code: "unavailable" | "internal_error";
      retryable: boolean;
      summary: string;
    };

export type CompanionState =
  | { status: "idle" }
  | { status: "listening" }
  | { status: "transcribing" }
  | { status: "thinking"; requestId: string }
  | {
      status: "awaiting_confirmation";
      proposal: ActionProposalView;
      confirmationToken: ConfirmationToken;
    }
  | { status: "executing"; requestId: string }
  | { status: "responded"; requestId: string; text: string }
  | { status: "error"; requestId?: string; message: string };
