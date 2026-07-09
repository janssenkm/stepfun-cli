import { APIError } from '../api';

/** Stable process exit codes used by shell and CI integrations. */
export const EXIT = {
  OK: 0,
  GENERIC: 1,
  USAGE: 2,
  AUTH: 3,
  QUOTA: 4,
  TIMEOUT: 5,
  NETWORK: 6,
  CONTENT_FILTER: 10
} as const;

const CODE_NAME = {
  [EXIT.OK]: 'OK',
  [EXIT.GENERIC]: 'API_ERROR',
  [EXIT.USAGE]: 'USAGE',
  [EXIT.AUTH]: 'AUTH',
  [EXIT.QUOTA]: 'QUOTA',
  [EXIT.TIMEOUT]: 'TIMEOUT',
  [EXIT.NETWORK]: 'NETWORK',
  [EXIT.CONTENT_FILTER]: 'CONTENT_FILTER'
} as const;

/** User-input failure carrying an optional corrective hint. */
export class UsageError extends Error {
  hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UsageError';
    this.hint = hint;
  }
}

/** Known command surface that is not backed by a supported StepFun API yet. */
export class UnsupportedError extends Error {
  hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UnsupportedError';
    this.hint = hint;
  }
}

export interface ClassifiedError {
  code: number;
  name: string;
  message: string;
  hint?: string;
}

/** Converts transport, API, authentication, and usage failures to CLI errors. */
export function classifyError(error: unknown): ClassifiedError {
  const err = error as any;
  const message = err?.message || String(error);
  const errName = err?.name || '';
  const causeCode = err?.cause?.code || '';
  const status = err?.status as number | undefined;

  if (errName === 'AbortError' || errName === 'TimeoutError' || /timed out/i.test(message)) {
    return {
      code: EXIT.TIMEOUT,
      name: CODE_NAME[EXIT.TIMEOUT],
      message,
      hint: 'The request timed out. Try increasing --timeout or retry later.'
    };
  }

  if (/abort|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH/i.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/.test(causeCode)
  ) {
    return {
      code: EXIT.NETWORK,
      name: CODE_NAME[EXIT.NETWORK],
      message,
      hint: 'Check your network connection, the API base URL, or raise --timeout.'
    };
  }

  if (error instanceof APIError) {
    if (error.status === 401 || error.status === 403) {
      return {
        code: EXIT.AUTH,
        name: CODE_NAME[EXIT.AUTH],
        message,
        hint: 'Check that your API key is valid and authorized for this region/model.'
      };
    }
    if (error.status === 402 || error.status === 429) {
      return {
        code: EXIT.QUOTA,
        name: CODE_NAME[EXIT.QUOTA],
        message,
        hint: 'Quota or rate limit exceeded. Check your account balance or retry later.'
      };
    }
    if (error.status === 408 || error.status === 504) {
      return {
        code: EXIT.TIMEOUT,
        name: CODE_NAME[EXIT.TIMEOUT],
        message,
        hint: 'The request timed out. Try increasing --timeout or retry later.'
      };
    }
    if (error.status === 451 || /content filter|content moderation|moderation|sensitivity|审核/i.test(message)) {
      return {
        code: EXIT.CONTENT_FILTER,
        name: CODE_NAME[EXIT.CONTENT_FILTER],
        message,
        hint: 'Content was blocked by moderation. Adjust your input and retry.'
      };
    }
    return {
      code: EXIT.GENERIC,
      name: CODE_NAME[EXIT.GENERIC],
      message,
      hint: 'The API rejected the request; verify the model name, parameters, and account status.'
    };
  }

  if (/API key is required/i.test(message)) {
    return {
      code: EXIT.AUTH,
      name: CODE_NAME[EXIT.AUTH],
      message,
      hint: 'Run `stepfun auth login`, set `STEPFUN_API_KEY`, or pass `--api-key`.'
    };
  }

  if (error instanceof UnsupportedError) {
    return { code: EXIT.USAGE, name: 'UNSUPPORTED', message, hint: error.hint };
  }

  if (error instanceof UsageError) {
    return { code: EXIT.USAGE, name: CODE_NAME[EXIT.USAGE], message, hint: error.hint };
  }

  return { code: EXIT.GENERIC, name: CODE_NAME[EXIT.GENERIC], message };
}

/** Writes a classified error to stderr and returns its process exit code. */
export function emitError(error: unknown, output: string): number {
  const { code, name, message, hint } = classifyError(error);
  if (output === 'json') {
    const envelope: Record<string, unknown> = { code: name, message };
    if (hint) envelope.hint = hint;
    console.error(JSON.stringify({ error: envelope }));
  } else {
    console.error(`Error: ${message}`);
    if (hint) console.error(`Hint: ${hint}`);
    console.error(`(exit code ${code})`);
  }
  return code;
}
