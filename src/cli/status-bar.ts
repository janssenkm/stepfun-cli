import type { Region } from '../config';
import { CONFIG_FILE } from '../config';

interface StatusBarConfig {
  quiet?: boolean;
}

let printed = false;

export function resetStatusBar(): void {
  printed = false;
}

function maskApiKey(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return '********';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function tildePath(p: string): string {
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  return p.startsWith(homedir) ? p.replace(homedir, '~') : p;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function maybeShowStatusBar(
  config: StatusBarConfig,
  apiKey: string | undefined,
  region: Region,
  baseUrl: string,
  model?: string
): void {
  if (config.quiet || printed || !process.stderr.isTTY) return;
  printed = true;

  const filePath = tildePath(CONFIG_FILE);
  const baseUrlStr = stripScheme(baseUrl);
  const keySrc = apiKey ? '(flag)' : '(file)';
  const maskedKey = maskApiKey(apiKey);
  const modelStr = model ? ` | Model: ${model}` : '';

  process.stderr.write(
    `${filePath} | URL: ${baseUrlStr} | Key: ${maskedKey} ${keySrc} | Region: ${region}${modelStr}\n`
  );
}
