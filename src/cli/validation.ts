export type ErrorConstructor = new (message: string, hint?: string) => Error;

export function optionalNumber(value: unknown, flag: string, ErrorType: ErrorConstructor): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ErrorType(`Invalid ${flag}: ${value}`, `${flag} must be a number.`);
  return parsed;
}

export function optionalInteger(value: unknown, flag: string, ErrorType: ErrorConstructor): number | undefined {
  if (value === undefined) return undefined;
  const text = String(value);
  if (!/^-?\d+$/.test(text)) throw new ErrorType(`Invalid ${flag}: ${value}`, `${flag} must be an integer.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new ErrorType(`Invalid ${flag}: ${value}`, `${flag} must be a safe integer.`);
  return parsed;
}

export function positiveNumber(value: unknown, flag: string, ErrorType: ErrorConstructor): number {
  const parsed = optionalNumber(value, flag, ErrorType);
  if (parsed === undefined || parsed <= 0) throw new ErrorType(`Invalid ${flag}: ${value}`, `${flag} must be a positive number.`);
  return parsed;
}

export function requireExactlyOne(values: Record<string, unknown>, names: string[], ErrorType: ErrorConstructor): string {
  const present = names.filter(name => values[name] !== undefined && values[name] !== false);
  if (present.length !== 1) throw new ErrorType(`exactly one of ${names.map(name => `--${name}`).join(' / ')} is required`);
  return present[0];
}
