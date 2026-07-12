import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';

function usage(message: string): never {
  throw new CLIError(message, ExitCode.USAGE);
}

export function oneOf(name: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) usage(`${name} must be one of: ${allowed.join(', ')}.`);
}

export function numberRange(
  name: string,
  value: number | undefined,
  min: number,
  max: number,
  integer = false,
): void {
  if (value === undefined) return;
  if (integer && !Number.isInteger(value)) usage(`${name} must be an integer.`);
  if (value < min || value > max) usage(`${name} must be between ${min} and ${max}.`);
}

export function maxLength(name: string, value: string | undefined, max: number): void {
  if (value !== undefined && value.length > max) usage(`${name} must be at most ${max} characters.`);
}

export function mutuallyExclusive(a: string, av: unknown, b: string, bv: unknown): void {
  if (av !== undefined && bv !== undefined) usage(`Pass either ${a} or ${b}, not both.`);
}
