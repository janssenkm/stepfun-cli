import { CLIError } from './base';
import { ExitCode } from './codes';

// StepFun error body: {"error":{"message":...,"type":...,"code":...}}
export interface ApiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

function quotaHint(region: 'StepPlan-Global' | 'StepPlan-CN'): string {
  if (region === 'StepPlan-CN') {
    return 'StepPlan (CN) runs on a monthly Credit pool — check your balance or add a refill pack at https://platform.stepfun.com/step-plan';
  }
  return 'StepPlan (Global) enforces 5-hour and weekly prompt limits — wait for the window to reset or upgrade at https://platform.stepfun.ai/step-plan';
}

export function mapApiError(
  status: number,
  body: ApiErrorBody,
  url?: string,
  region: 'StepPlan-Global' | 'StepPlan-CN' = 'StepPlan-Global',
): CLIError {
  const apiMsg = body.error?.message || `HTTP ${status}`;
  const type = body.error?.type;

  if (status === 400) {
    return new CLIError(`Invalid request: ${apiMsg}`, ExitCode.USAGE);
  }
  if (status === 401 || status === 403) {
    return new CLIError(
      `Authentication failed (HTTP ${status}): ${apiMsg}`,
      ExitCode.AUTH,
      'Check your key: stepfun auth status\nRe-authenticate: stepfun auth login',
    );
  }
  if (status === 402) {
    return new CLIError(
      `Insufficient balance (HTTP 402): ${apiMsg}`,
      ExitCode.QUOTA,
      `Add funds / activate StepPlan at ${region === 'StepPlan-CN' ? 'https://platform.stepfun.com' : 'https://platform.stepfun.ai'}`,
    );
  }
  if (status === 404) {
    return new CLIError(
      `Not found (HTTP 404): ${apiMsg}${url ? ` — ${url}` : ''}`,
      ExitCode.GENERAL,
      'Check the endpoint path and that the resource belongs to your account.',
    );
  }
  if (status === 408 || status === 504) {
    return new CLIError(
      `Request timed out (HTTP ${status}).`,
      ExitCode.TIMEOUT,
      'Retry, or raise --timeout.',
    );
  }
  if (status === 429) {
    return new CLIError(
      `Rate / plan limit exceeded (HTTP 429): ${apiMsg}`,
      ExitCode.QUOTA,
      quotaHint(region),
    );
  }
  if (status === 451) {
    return new CLIError(
      `Content filtered (HTTP 451): ${apiMsg}`,
      ExitCode.CONTENT_FILTER,
      'Modify the request content and retry.',
    );
  }

  return new CLIError(`API error: ${apiMsg}${type ? ` [${type}]` : ''} (HTTP ${status})`, ExitCode.GENERAL);
}
