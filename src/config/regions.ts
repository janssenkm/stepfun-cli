// StepPlan has a dedicated generation base (/step_plan/v1) billed against the
// subscription, while platform-management endpoints (accounts, files, model
// metadata, system voices) only resolve on the public /v1 base — both accept
// the same API key. This split was confirmed by real probes against the API.
export type Region = 'StepPlan-Global' | 'StepPlan-CN';

export interface RegionProfile {
  region: Region;
  genBase: string; // generation (StepPlan subscription billing)
  apiBase: string; // management (open platform, public /v1)
  docsHost: string;
}

export const REGIONS: Record<Region, RegionProfile> = {
  'StepPlan-Global': {
    region: 'StepPlan-Global',
    genBase: 'https://api.stepfun.ai/step_plan/v1',
    apiBase: 'https://api.stepfun.ai/v1',
    docsHost: 'https://platform.stepfun.ai',
  },
  'StepPlan-CN': {
    region: 'StepPlan-CN',
    genBase: 'https://api.stepfun.com/step_plan/v1',
    apiBase: 'https://api.stepfun.com/v1',
    docsHost: 'https://platform.stepfun.com',
  },
};

export const DEFAULT_REGION: Region = 'StepPlan-Global';

export function isValidRegion(value: string): value is Region {
  return value in REGIONS;
}
