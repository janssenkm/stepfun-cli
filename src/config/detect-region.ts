import { REGION_PROFILES, Region } from './regions';

const PROBE_PATH = '/models';

export interface DetectRegionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  profiles?: typeof REGION_PROFILES;
}

/** Probes both StepPlan regions and falls back to Global when neither validates. */
export async function detectRegion(apiKey: string, options: DetectRegionOptions = {}): Promise<Region> {
  const profiles = options.profiles ?? REGION_PROFILES;
  const regions = Object.keys(profiles) as Region[];
  const results = await Promise.all(regions.map(async region => ({
    region,
    ok: await probeRegion(profiles[region].baseUrl, apiKey, options)
  })));
  return results.find(result => result.ok)?.region ?? 'StepPlan-Global';
}

/** Detects and persists the canonical result, including the Global fallback. */
export async function detectAndCacheRegion(
  apiKey: string,
  save: (region: Region) => void,
  options: DetectRegionOptions = {}
): Promise<Region> {
  const region = await detectRegion(apiKey, options);
  save(region);
  return region;
}

async function probeRegion(baseUrl: string, apiKey: string, options: DetectRegionOptions): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const authHeaders: Record<string, string>[] = [
    { Authorization: `Bearer ${apiKey}` },
    { 'x-api-key': apiKey }
  ];
  for (const auth of authHeaders) {
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${PROBE_PATH}`, {
        method: 'GET',
        headers: { ...auth, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) return true;
    } catch {
      // Try the other authentication style before rejecting this region.
    }
  }
  return false;
}
