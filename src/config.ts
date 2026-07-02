import os from 'os';
import path from 'path';
import fs from 'fs';

export interface Config {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
}

const configDir = path.join(os.homedir(), '.stepfun-cli');
const configFile = path.join(configDir, 'config.json');

export const REGION_URLS: Record<string, string> = {
  'StepPlan-CN': 'https://api.stepfun.com/step_plan/v1',
  'StepPlan-Global': 'https://api.stepfun.ai/step_plan/v1',
  'PayGo-CN': 'https://api.stepfun.com/v1',
  'PayGo-Global': 'https://api.stepfun.ai/v1'
};

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

export function saveConfig(config: Config) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const current = loadConfig();
  const next = { ...current, ...config };
  fs.writeFileSync(configFile, JSON.stringify(next, null, 2), 'utf-8');
}
