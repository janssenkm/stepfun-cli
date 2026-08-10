// StepPlan has a dedicated generation base (/step_plan/v1) billed against the
// subscription, while platform-management endpoints (accounts, files, model
// metadata, system voices) only resolve on the public /v1 base — both accept
// the same API key. This split was confirmed by real probes against the API.
export type Region = 'Global' | 'CN';

export interface RegionProfile {
  region: Region;
  genBase: string; // generation (StepPlan subscription billing)
  apiBase: string; // management (open platform, public /v1)
  docsHost: string;
}

export const REGIONS: Record<Region, RegionProfile> = {
  Global: {
    region: 'Global',
    genBase: 'https://api.stepfun.ai/step_plan/v1',
    apiBase: 'https://api.stepfun.ai/v1',
    docsHost: 'https://platform.stepfun.ai',
  },
  CN: {
    region: 'CN',
    genBase: 'https://api.stepfun.com/step_plan/v1',
    apiBase: 'https://api.stepfun.com/v1',
    docsHost: 'https://platform.stepfun.com',
  },
};

export const DEFAULT_REGION: Region = 'Global';

/** Parse user-facing region names case-insensitively. */
export function parseRegion(value: string): Region | undefined {
  switch (value.trim().toLowerCase()) {
    case 'global': return 'Global';
    case 'cn': return 'CN';
    // Keep existing config files usable after the region-name simplification.
    case 'stepplan-global': return 'Global';
    case 'stepplan-cn': return 'CN';
    default: return undefined;
  }
}

export function isValidRegion(value: string): boolean {
  return parseRegion(value) !== undefined;
}
