/** Reads one secret per call. Implementations must never echo it. */
export type SecretReader = (question: string) => Promise<string>;

export interface CliOptions {
  /** Where secrets (the PIN) are read from. Defaults to a hidden TTY prompt or piped stdin. */
  readSecret?: SecretReader | undefined;
}
