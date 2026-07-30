export type HashpassErrorCode =
  | "configuration_error"
  | "network_error"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation_error"
  | "api_error";

export class HashpassError extends Error {
  readonly code: HashpassErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(message: string, options: {
    code: HashpassErrorCode;
    status?: number | undefined;
    requestId?: string | undefined;
    details?: unknown;
    cause?: unknown;
  }) {
    super(message, { cause: options.cause });
    this.name = "HashpassError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}
