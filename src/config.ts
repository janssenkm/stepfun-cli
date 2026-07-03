import os from 'os';
import path from 'path';
import fs from 'fs';

export interface Config {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  output?: string;
  timeout?: number;
  defaultTextModel?: string;
  defaultSpeechModel?: string;
}

const configDir = path.join(os.homedir(), '.stepfun-cli');
const configFile = path.join(configDir, 'config.json');

export type Geography = 'CN' | 'Global';
export type Billing = 'PayGo' | 'StepPlan';

export interface RegionProfile {
  region: string;
  baseUrl: string;
  geography: Geography;
  billing: Billing;
  supportsNonChat: boolean;
}

export const REGION_PROFILES: Record<string, RegionProfile> = {
  'StepPlan-CN':     { region: 'StepPlan-CN',     baseUrl: 'https://api.stepfun.com/step_plan/v1', geography: 'CN',     billing: 'StepPlan', supportsNonChat: false },
  'StepPlan-Global': { region: 'StepPlan-Global', baseUrl: 'https://api.stepfun.ai/step_plan/v1',   geography: 'Global', billing: 'StepPlan', supportsNonChat: false },
  'PayGo-CN':        { region: 'PayGo-CN',        baseUrl: 'https://api.stepfun.com/v1',           geography: 'CN',     billing: 'PayGo',    supportsNonChat: true },
  'PayGo-Global':    { region: 'PayGo-Global',    baseUrl: 'https://api.stepfun.ai/v1',            geography: 'Global', billing: 'PayGo',    supportsNonChat: true },
};

/**
 * Reads the optional user configuration. A missing or malformed file is treated
 * as empty so a bad local file cannot prevent recovery through `auth login`.
 */
export function loadConfig(): Config {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    // ignore
  }
  return {};
}

/**
 * Applies a partial update while preserving unrelated settings. An explicit
 * `undefined` disappears during JSON serialization; callers use this to clear
 * a custom base URL after choosing a named region.
 */
export function saveConfig(config: Config): void {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const current = loadConfig();
  const next = { ...current, ...config };
  fs.writeFileSync(configFile, JSON.stringify(next, null, 2), 'utf-8');
}
