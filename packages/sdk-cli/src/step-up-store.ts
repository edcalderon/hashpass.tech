import type { StepUpProof, StepUpProofStore, StepUpScope } from "@hashpass-tech/sdk/auth";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SCOPES: readonly StepUpScope[] = ["app:unlock", "wallet:sign"];

export const isStepUpScope = (value: unknown): value is StepUpScope =>
  typeof value === "string" && (SCOPES as readonly string[]).includes(value);

/**
 * Keeps step-up proofs between CLI invocations so `pin verify` and a later signing
 * command can be separate processes. A proof is short-lived (a minute for
 * `wallet:sign`) and scoped, so the file is low-value, but it is still written 0600
 * like the session. The PIN itself is never written anywhere.
 *
 * Two processes updating different scopes at the same instant can lose one write;
 * the loser simply has to verify again, which is the safe direction to fail.
 */
export class FileStepUpProofStore implements StepUpProofStore {
  constructor(readonly path: string) {}

  async get(scope: StepUpScope): Promise<StepUpProof | null> {
    return (await this.#read())[scope] ?? null;
  }

  async set(proof: StepUpProof): Promise<void> {
    await this.#write({ ...(await this.#read()), [proof.scope]: proof });
  }

  async clear(scope?: StepUpScope): Promise<void> {
    if (!scope) { await rm(this.path, { force: true }); return; }
    const { [scope]: _removed, ...rest } = await this.#read();
    if (Object.keys(rest).length === 0) await rm(this.path, { force: true });
    else await this.#write(rest);
  }

  async #read(): Promise<Partial<Record<StepUpScope, StepUpProof>>> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      // A missing or corrupt file just means "no proofs": the person verifies again.
      if (error instanceof SyntaxError || (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) return {};
      throw error;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const proofs: Partial<Record<StepUpScope, StepUpProof>> = {};
    for (const scope of SCOPES) {
      const candidate = (value as Record<string, unknown>)[scope];
      if (isProof(candidate, scope)) proofs[scope] = candidate;
    }
    return proofs;
  }

  async #write(proofs: Partial<Record<StepUpScope, StepUpProof>>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(proofs, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}

function isProof(value: unknown, scope: StepUpScope): value is StepUpProof {
  if (!value || typeof value !== "object") return false;
  const proof = value as Partial<StepUpProof>;
  return typeof proof.token === "string" && proof.token.length > 0
    && proof.scope === scope
    && typeof proof.expiresAt === "string" && !Number.isNaN(Date.parse(proof.expiresAt));
}
