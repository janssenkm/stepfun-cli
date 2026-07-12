import type { Config } from '../config/schema';
import type { ApiErrorBody } from '../errors/api';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import { mapApiError } from '../errors/api';
import { CLI_VERSION } from '../version';

export interface RequestOpts {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  /** Keep the response body stream open (caller will consume SSE / bytes). */
  stream?: boolean;
  /** Skip auth header (e.g. for unauthenticated health checks). */
  noAuth?: boolean;
}

function requireKey(config: Config): string {
  const key = config.apiKey;
  if (!key) {
    throw new CLIError(
      'No API key configured.',
      ExitCode.AUTH,
      'Run: stepfun auth login   — or set STEPFUN_API_KEY / pass --api-key',
    );
  }
  return key;
}

export async function request(config: Config, opts: RequestOpts): Promise<Response> {
  const isFormData =
    typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const headers: Record<string, string> = {
    'User-Agent': `stepfun-cli/${CLI_VERSION}`,
    ...opts.headers,
  };

  if (!isFormData && !headers['Content-Type'] && opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!opts.noAuth) {
    const key = requireKey(config);
    headers['Authorization'] = `Bearer ${key}`;
  }

  if (config.verbose) {
    process.stderr.write(`> ${opts.method ?? 'GET'} ${opts.url}\n`);
    if (!opts.noAuth) {
      const key = config.apiKey!;
      process.stderr.write(`> Authorization: Bearer ${key.slice(0, 8)}…\n`);
    }
    if (opts.body && !isFormData && typeof opts.body === 'object') {
      process.stderr.write(`> body: ${JSON.stringify(opts.body).slice(0, 500)}\n`);
    }
  }

  const timeoutMs = (opts.timeout ?? config.timeout) * 1000;

  const res = await fetch(opts.url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body
      ? isFormData
        ? (opts.body as FormData)
        : typeof opts.body === 'string'
          ? opts.body
          : JSON.stringify(opts.body)
      : undefined,
    // For streaming responses we must not abort on the (header) timeout — the
    // caller controls lifetime.
    signal: opts.stream ? undefined : AbortSignal.timeout(timeoutMs),
  });

  if (config.verbose) {
    process.stderr.write(`< ${res.status} ${res.statusText}\n`);
  }

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try { body = (await res.json()) as ApiErrorBody; } catch { /* non-JSON */ }
    throw mapApiError(res.status, body, opts.url, config.region);
  }

  return res;
}

export async function requestJson<T>(config: Config, opts: RequestOpts): Promise<T> {
  const res = await request(config, opts);
  try {
    return (await res.json()) as T;
  } catch {
    const contentType = res.headers.get('content-type') || '';
    throw new CLIError(
      `API returned non-JSON response (${contentType || 'unknown type'}).`,
      ExitCode.GENERAL,
    );
  }
}

export async function requestBytes(config: Config, opts: RequestOpts): Promise<Buffer> {
  const res = await request(config, opts);
  return Buffer.from(await res.arrayBuffer());
}

/** Open a streaming response for SSE consumption. Caller iterates parseSSE(res). */
export async function requestStream(config: Config, opts: RequestOpts): Promise<Response> {
  return request(config, { ...opts, stream: true });
}
