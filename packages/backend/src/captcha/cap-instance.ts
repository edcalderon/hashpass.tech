import Cap from '@cap.js/server';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

function resolveDataDir(namespace: string): string {
  const tmp = `/tmp/cap-data-${namespace}`;
  try {
    fs.mkdirSync(tmp, { recursive: true });
    return tmp;
  } catch {
    // Lambda always allows /tmp -- this only matters for local/non-Lambda runs.
  }
  const local = path.resolve(process.cwd(), '.data', namespace);
  try {
    fs.mkdirSync(local, { recursive: true });
    return local;
  } catch {
    return '.data';
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fsPromises.readFile(filePath, 'utf8')) || {};
  } catch {
    return {};
  }
}

async function writeJson(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fsPromises.writeFile(filePath, JSON.stringify(data), 'utf8');
}

function buildCapInstance(namespace: string): Cap {
  const dataDir = resolveDataDir(namespace);
  const challengesPath = path.join(dataDir, 'challengesList.json');
  const tokensPath = path.join(dataDir, 'tokensList.json');

  for (const filePath of [challengesPath, tokensPath]) {
    try {
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '{}', 'utf8');
    } catch {
      // Best-effort -- Cap still functions with an empty in-memory store if this fails.
    }
  }

  return new Cap({
    tokens_store_path: tokensPath,
    noFSState: true,
    storage: {
      challenges: {
        store: async (token, data) => {
          const store = await readJson(challengesPath);
          store[token] = data;
          await writeJson(challengesPath, store);
        },
        read: async (token) => {
          const store = await readJson(challengesPath);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (store[token] as any) ?? null;
        },
        delete: async (token) => {
          const store = await readJson(challengesPath);
          delete store[token];
          await writeJson(challengesPath, store);
        },
        deleteExpired: async () => {
          const store = await readJson(challengesPath);
          const now = Date.now();
          let changed = false;
          for (const key of Object.keys(store)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((store[key] as any)?.expires < now) {
              delete store[key];
              changed = true;
            }
          }
          if (changed) await writeJson(challengesPath, store);
        },
      },
      tokens: {
        store: async (key, expires) => {
          const store = await readJson(tokensPath);
          store[key] = expires;
          await writeJson(tokensPath, store);
        },
        get: async (key) => {
          const store = await readJson(tokensPath);
          return (store[key] as number) ?? null;
        },
        delete: async (key) => {
          const store = await readJson(tokensPath);
          delete store[key];
          await writeJson(tokensPath, store);
        },
        deleteExpired: async () => {
          const store = await readJson(tokensPath);
          const now = Date.now();
          let changed = false;
          for (const key of Object.keys(store)) {
            if ((store[key] as number) < now) {
              delete store[key];
              changed = true;
            }
          }
          if (changed) await writeJson(tokensPath, store);
        },
      },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __hashpassCapInstances: Record<string, Cap> | undefined;
}

/**
 * Returns a shared Cap (proof-of-work captcha, https://capjs.js.org) instance
 * for the given namespace -- one per service (e.g. 'mobile-app-newsletter',
 * 'hashpass-links-api') so each keeps isolated on-disk challenge/token
 * storage rather than colliding on the same files. Memoized on a global so
 * every route module in the same warm Lambda container reuses one instance
 * per namespace: without this, each route module would construct its own
 * Cap instance, and each one registers its own SIGINT/SIGTERM/SIGQUIT/
 * beforeExit listeners, eventually exceeding Node's MaxListeners warning
 * threshold. Extracted from the original single-service
 * apps/mobile-app/lib/cap-instance.ts so every service that needs Cap
 * shares one filesystem storage adapter instead of copy-pasting it.
 */
export function getCapInstance(namespace: string): Cap {
  if (!globalThis.__hashpassCapInstances) {
    globalThis.__hashpassCapInstances = {};
  }
  if (!globalThis.__hashpassCapInstances[namespace]) {
    globalThis.__hashpassCapInstances[namespace] = buildCapInstance(namespace);
  }
  return globalThis.__hashpassCapInstances[namespace];
}
