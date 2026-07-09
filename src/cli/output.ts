/** Writes a stable JSON value to stdout. */
export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Writes text to stdout and guarantees one trailing newline. */
export function writeText(value: unknown): void {
  const text = String(value ?? '');
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/** Writes a JSON or text representation according to the resolved format. */
export function writeResult(value: unknown, format: string, text?: (value: any) => string): void {
  if (format === 'json') writeJson(value);
  else writeText(text ? text(value) : formatTextObject(value));
}

/** Writes non-essential progress to stderr unless quiet mode is active. */
export function writeProgress(message: string, quiet = false): void {
  if (!quiet) process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

function formatTextObject(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  return Object.entries(value)
    .filter(([, field]) => field !== undefined && field !== null)
    .map(([key, field]) => `${key}: ${typeof field === 'object' ? JSON.stringify(field) : field}`)
    .join('\n');
}
