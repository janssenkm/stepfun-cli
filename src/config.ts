import os from 'os';
import path from 'path';
import fs from 'fs';
import { parseConfig } from './config/schema';
export { REGION_PROFILES, normalizeRegion, regionChoices } from './config/regions';
export type { Geography, Region, RegionProfile } from './config/regions';

/** Persisted user configuration stored in ~/.stepfun-cli/config.json. */
export interface Config {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  output?: string;
  timeout?: number;
  defaultTextModel?: string;
  defaultSpeechModel?: string;
  configPath?: string;
}

const configDir = path.join(os.homedir(), '.stepfun-cli');
export const CONFIG_FILE = path.join(configDir, 'config.json');

/**
 * Reads the optional user configuration. A missing or malformed file is treated
 * as empty so a bad local file cannot prevent recovery through `auth login`.
 */
export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const result = parseConfig(JSON.parse(data) as unknown);
      for (const warning of result.warnings) warn(warning);
      return { ...result.config, configPath: CONFIG_FILE };
    }
  } catch (error) {
    const message = error instanceof SyntaxError
      ? 'Configuration contains invalid JSON and was ignored.'
      : 'Configuration could not be read and was ignored.';
    warn(message);
  }
  return { configPath: CONFIG_FILE };
}

/**
 * Applies a partial update while preserving unrelated settings. An explicit
 * `undefined` disappears during JSON serialization; callers use this to clear
 * a custom base URL after choosing a named region.
 */
export function saveConfig(config: Config): void {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(configDir, 0o700);
  const current = loadConfig();
  const { configPath: _ignored, ...rest } = current as any;
  const next = { ...rest, ...config };
  const temporaryFile = path.join(
    configDir,
    `.config.json.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temporaryFile, CONFIG_FILE);
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // The temporary file may not exist if creation itself failed.
    }
    throw error;
  }
}

/** Report recoverable persisted-configuration problems without exposing values. */
function warn(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}
