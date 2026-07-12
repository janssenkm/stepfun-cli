import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, chmodSync } from 'fs';

export const CONFIG_DIR = join(homedir(), '.stepfun-cli');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // best-effort; filesystem may not support chmod
  }
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
