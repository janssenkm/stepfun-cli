import { USER_AGENT } from '../version';
import { endpointUrl } from './endpoints';

/** HTTP error with a stable status field for CLI exit-code classification. */
export class APIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** API path relative to the configured base URL. */
  endpoint: string;
  /** Additional request headers. Authentication headers cannot be overridden. */
  headers?: HeadersInit;
}

/** Shared authenticated HTTP transport for all StepFun capabilities. */
export class HttpClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly verbose = false
  ) {}

  /** Sends a request with authentication, User-Agent, timeout, and error handling. */
  async request(options: RequestOptions): Promise<Response> {
    const { endpoint, headers, ...init } = options;
    const url = endpointUrl(this.baseUrl, endpoint);
    const method = init.method || 'GET';
    const requestHeaders = new Headers(headers);
    requestHeaders.set('User-Agent', USER_AGENT);
    requestHeaders.set('Authorization', `Bearer ${this.apiKey}`);
    this.log(`HTTP request: ${method} ${url}`);
    const response = await fetch(url, {
      ...init,
      headers: requestHeaders,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    this.log(`HTTP response: ${response.status} ${response.statusText || ''}`.trim());

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `API Error (${response.status}): ${errorText}`);
    }
    return response;
  }

  /** Sends a request and decodes its JSON response. */
  async requestJson<T = any>(options: RequestOptions): Promise<T> {
    const response = await this.request(options);
    return await response.json() as T;
  }

  /** Sends a request and returns its binary response. */
  async requestBuffer(options: RequestOptions): Promise<Buffer> {
    const response = await this.request(options);
    return Buffer.from(await response.arrayBuffer());
  }

  /** Sends a request and returns its plain-text response. */
  async requestText(options: RequestOptions): Promise<string> {
    const response = await this.request(options);
    return await response.text();
  }

  private log(message: string): void {
    if (this.verbose) process.stderr.write(`[verbose] ${message}\n`);
  }
}
