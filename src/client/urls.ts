import type { Config } from '../config/schema';

function join(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

/** Generation endpoint (StepPlan subscription billing) — /step_plan/v1. */
export function genUrl(config: Config, path: string): string {
  return join(config.genBaseUrl, path);
}

/** Management endpoint (open platform) — public /v1. */
export function mgmtUrl(config: Config, path: string): string {
  return join(config.apiBaseUrl, path);
}
