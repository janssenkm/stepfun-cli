/** Mask an API key for safe display: first 6 + last 4 chars, '(none)' if absent,
 *  '****' if too short to mask meaningfully. */
export function maskKey(k?: string): string {
  if (!k) return '(none)';
  return k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '****';
}
