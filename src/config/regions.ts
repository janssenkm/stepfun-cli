export type Region = 'StepPlan-Global' | 'StepPlan-CN';
export type Geography = 'Global' | 'CN';

export interface RegionProfile {
  region: Region;
  baseUrl: string;
  geography: Geography;
  supportsNonChat: boolean;
}

/** Canonical StepPlan regions supported by the CLI. */
export const REGION_PROFILES: Record<Region, RegionProfile> = {
  'StepPlan-Global': {
    region: 'StepPlan-Global',
    baseUrl: 'https://api.stepfun.ai/step_plan/v1',
    geography: 'Global',
    supportsNonChat: false
  },
  'StepPlan-CN': {
    region: 'StepPlan-CN',
    baseUrl: 'https://api.stepfun.com/step_plan/v1',
    geography: 'CN',
    supportsNonChat: false
  }
};

const REGION_ALIASES: Record<string, Region> = {
  global: 'StepPlan-Global',
  'stepplan-global': 'StepPlan-Global',
  'stepfun-global': 'StepPlan-Global',
  cn: 'StepPlan-CN',
  'stepplan-cn': 'StepPlan-CN'
};

/** Resolves canonical names and case-insensitive short aliases. */
export function normalizeRegion(value: string): Region | undefined {
  return REGION_ALIASES[value.trim().toLowerCase()];
}

export function regionChoices(): string {
  return 'StepPlan-Global (Global), StepPlan-CN (CN)';
}
