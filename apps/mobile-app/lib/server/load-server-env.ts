import { config as loadDotenv } from 'dotenv';
import fs from 'fs';
import path from 'path';

let envLoaded = false;

export function loadServerEnvFiles(): void {
  if (
    envLoaded ||
    typeof process === 'undefined' ||
    typeof window !== 'undefined' ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.JEST_WORKER_ID)
  ) {
    return;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '..', '.env.local'),
    path.resolve(cwd, '..', '.env'),
    path.resolve(cwd, '..', '..', '.env.local'),
    path.resolve(cwd, '..', '..', '.env'),
    path.resolve(cwd, '..', '..', '..', '.env.local'),
    path.resolve(cwd, '..', '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false, quiet: true });
    }
  }

  envLoaded = true;
}
