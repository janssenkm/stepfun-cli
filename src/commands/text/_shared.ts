import { readFileSync, existsSync } from 'fs';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

/** Parse repeated --tool values: each is inline JSON or a path to a JSON file. */
export function parseTools(values: string[] | undefined): unknown[] {
  if (!values || values.length === 0) return [];
  const out: unknown[] = [];
  for (const v of values) {
    let raw = v.trim();
    if (!(raw.startsWith('{') || raw.startsWith('['))) {
      if (!existsSync(raw)) throw new CLIError(`--tool file not found: ${v}`, ExitCode.USAGE);
      raw = readFileSync(raw, 'utf-8');
    }
    try {
      out.push(JSON.parse(raw));
    } catch {
      throw new CLIError(`--tool is not valid JSON: ${v.slice(0, 60)}`, ExitCode.USAGE);
    }
  }
  return out;
}

export function formatUsageLine(usage: Record<string, unknown> | undefined): string {
  if (!usage) return '';
  const pt = usage.prompt_tokens ?? usage.input_tokens;
  const ct = usage.completion_tokens ?? usage.output_tokens;
  const tt = usage.total_tokens;
  if (tt != null) return `tokens: ${pt ?? '?'} in + ${ct ?? '?'} out = ${tt} total`;
  if (pt != null || ct != null) return `tokens: ${pt ?? '?'} in + ${ct ?? '?'} out`;
  return '';
}

export function dim(s: string): string {
  return process.stderr.isTTY ? `\x1b[2m${s}\x1b[0m` : s;
}
