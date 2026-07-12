import { formatText } from './text';
import { formatJson } from './json';

export type OutputFormat = 'text' | 'json';

export function detectOutputFormat(flagValue?: string): OutputFormat {
  if (flagValue === 'json' || flagValue === 'text') return flagValue;
  if (!process.stdout.isTTY) return 'json';
  return 'text';
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case 'json': return formatJson(data);
    case 'text': return formatText(data);
  }
}

// dryRun() prints the would-be request body and returns true if dry-run is on.
export function dryRun(config: { dryRun?: boolean; output?: 'text' | 'json' }, body: unknown): boolean {
  if (!config.dryRun) return false;
  process.stdout.write(formatOutput({ request: body }, config.output ?? 'text') + '\n');
  return true;
}
