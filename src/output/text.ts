// Generic human-friendly renderer for arbitrary JSON-like data: nested objects
// as `key: value` lines, arrays of primitives as bullets, arrays of objects as
// numbered blocks. Commands with bespoke formatting build their own strings and
// bypass this.
function render(value: unknown, indent: number, keyHint?: string): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return keyHint !== undefined ? `${pad}${keyHint}: ` : `${pad}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return keyHint !== undefined ? `${pad}${keyHint}: (none)` : '';
    // Array of plain primitives → bullet list.
    if (value.every((v) => v === null || typeof v !== 'object')) {
      const header = keyHint !== undefined ? `${pad}${keyHint}:\n` : '';
      return header + value.map((v) => `${pad}- ${String(v)}`).join('\n');
    }
    // Array of objects → numbered blocks.
    const header = keyHint !== undefined ? `${pad}${keyHint}:\n` : '';
    return (
      header +
      value
        .map((v, i) => `${pad}[${i + 1}]\n${render(v, indent + 1).replace(/\s+$/, '')}`)
        .join('\n')
    );
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj);
    if (entries.length === 0) return keyHint !== undefined ? `${pad}${keyHint}: {}` : `${pad}{}`;
    const header = keyHint !== undefined ? `${pad}${keyHint}:\n` : '';
    return header + entries.map(([k, v]) => render(v, indent, k)).filter(Boolean).join('\n');
  }

  return keyHint !== undefined ? `${pad}${keyHint}: ${String(value)}` : `${pad}${String(value)}`;
}

export function formatText(data: unknown): string {
  const out = render(data, 0);
  return out === '' ? '' : out.replace(/\n+$/, '');
}
