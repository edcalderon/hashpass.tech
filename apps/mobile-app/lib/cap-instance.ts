import Cap from '@cap.js/server';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

const dataDir = (() => {
    const tmp = '/tmp/cap-data';
    try { fs.mkdirSync(tmp, { recursive: true }); return tmp; } catch { /* noop */ }
    const local = path.resolve(process.cwd(), '.data');
    try { fs.mkdirSync(local, { recursive: true }); return local; } catch { /* noop */ }
    return '.data';
})();

const challengesPath = path.join(dataDir, 'challengesList.json');
const tokensPath = path.join(dataDir, 'tokensList.json');

for (const p of [challengesPath, tokensPath]) {
    try { if (!fs.existsSync(p)) fs.writeFileSync(p, '{}', 'utf8'); } catch { /* noop */ }
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

function createCapInstance(): Cap {
    console.log('[cap] dataDir:', dataDir);
    return new Cap({
        tokens_store_path: tokensPath,
        noFSState: true,
        storage: {
            challenges: {
                store: async (token: string, data: unknown) => {
                    const store = await readJson(challengesPath);
                    store[token] = data;
                    await writeJson(challengesPath, store);
                },
                read: async (token: string) => {
                    const store = await readJson(challengesPath);
                    return (store[token] as any) || null;
                },
                delete: async (token: string) => {
                    const store = await readJson(challengesPath);
                    delete store[token];
                    await writeJson(challengesPath, store);
                },
                deleteExpired: async () => {
                    const store = await readJson(challengesPath);
                    const now = Date.now();
                    let changed = false;
                    for (const k of Object.keys(store)) {
                        if ((store[k] as any)?.expires < now) { delete store[k]; changed = true; }
                    }
                    if (changed) await writeJson(challengesPath, store);
                },
            },
            tokens: {
                store: async (key: string, expires: number) => {
                    const store = await readJson(tokensPath);
                    store[key] = expires;
                    await writeJson(tokensPath, store);
                },
                get: async (key: string) => {
                    const store = await readJson(tokensPath);
                    return (store[key] as number) || null;
                },
                delete: async (key: string) => {
                    const store = await readJson(tokensPath);
                    delete store[key];
                    await writeJson(tokensPath, store);
                },
                deleteExpired: async () => {
                    const store = await readJson(tokensPath);
                    const now = Date.now();
                    let changed = false;
                    for (const k of Object.keys(store)) {
                        if ((store[k] as number) < now) { delete store[k]; changed = true; }
                    }
                    if (changed) await writeJson(tokensPath, store);
                },
            },
        },
    });
}

// Use a global singleton so every API route bundle shares the same Cap instance.
// Without this, each route creates its own Cap instance and each adds SIGINT/SIGTERM/
// SIGQUIT/beforeExit listeners to the process, exceeding Node's MaxListeners limit.
declare global {
    // eslint-disable-next-line no-var
    var __capInstance: Cap | undefined;
}

if (!global.__capInstance) {
    global.__capInstance = createCapInstance();
}

const cap = global.__capInstance;
export default cap;
