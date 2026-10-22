import type { SecretReader } from "./prompt.js";

export interface CliOptions {
  /** Where secrets (the PIN) are read from. Defaults to a hidden TTY prompt or piped stdin. */
  readSecret?: SecretReader | undefined;
}
