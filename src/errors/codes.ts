// Process exit codes. HTTP statuses map onto these in errors/api.ts (see PRD §5):
// 400→USAGE, 401/403→AUTH, 402/429→QUOTA, 408/504→TIMEOUT, 451→CONTENT_FILTER.
export const ExitCode = {
  SUCCESS: 0,
  GENERAL: 1,
  USAGE: 2,
  AUTH: 3,
  QUOTA: 4,
  TIMEOUT: 5,
  NETWORK: 6,
  CONTENT_FILTER: 10,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
