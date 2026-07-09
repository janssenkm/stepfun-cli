import type { Config } from '../config';
import { HttpClient } from './http';
import { EXIT } from '../cli/errors';
import { UsageError } from '../cli/errors';
import { writeProgress } from '../cli/output';

export interface PollOptions<T> {
  url: string;
  intervalSec: number;
  timeoutSec: number;
  isComplete: (data: T) => boolean;
  isFailed: (data: T) => boolean;
  getStatus?: (data: T) => string;
  quiet?: boolean;
}

export async function poll<T>(config: Config, opts: PollOptions<T>): Promise<T> {
  const apiKey = config.apiKey || '';
  const baseUrl = config.baseUrl || 'https://api.stepfun.ai/step_plan/v1';
  const timeoutMs = (config.timeout ?? 300) * 1000;
  const client = new HttpClient(apiKey, baseUrl, timeoutMs);
  const deadline = Date.now() + opts.timeoutSec * 1000;

  try {
    while (Date.now() < deadline) {
      const data = await client.requestJson<T>({ endpoint: opts.url });

      if (opts.getStatus && !opts.quiet) {
        writeProgress(`Status: ${opts.getStatus(data)}`, !!opts.quiet);
      }

      if (opts.isComplete(data)) {
        return data;
      }

      if (opts.isFailed(data)) {
        const status = opts.getStatus ? opts.getStatus(data) : 'failed';
        throw new UsageError(
          `Task ${status}.`,
          'Check the StepFun dashboard or --verbose output for details.'
        );
      }

      await new Promise(r => setTimeout(r, opts.intervalSec * 1000));
    }
  } finally {
  }

  throw new UsageError(
    'Polling timed out.',
    'Try increasing --timeout or check task status manually.'
  );
}
