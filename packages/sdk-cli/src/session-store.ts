import type { AuthSession, AuthSessionStore } from "@hashpass-tech/sdk/auth";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function defaultSessionPath(env: NodeJS.ProcessEnv = process.env): string {
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "hashpass", "session.json");
}

/** File storage for the CLI. Hosts with an OS keychain should provide their own store. */
export class FileSessionStore implements AuthSessionStore {
  constructor(readonly path = defaultSessionPath()) {}

  async get(): Promise<AuthSession | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
      return isSession(value) ? value : null;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async set(session: AuthSession): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }

  async clear(): Promise<void> { await rm(this.path, { force: true }); }
}

function isSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return typeof session.accessToken === "string"
    && session.tokenType === "Bearer"
    && typeof session.expiresAt === "string"
    && Array.isArray(session.scope);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
