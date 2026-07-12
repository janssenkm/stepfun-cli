import { DEFAULT_REGION, isValidRegion, type Region } from './regions';

// On-disk config (~/.stepfun-cli/config.json). Stored camelCase to match the
// pre-existing file written by earlier versions; snake_case aliases are also
// accepted on read for robustness.
export interface ConfigFile {
  apiKey?: string;
  region?: Region;
  genBaseUrl?: string;
  apiBaseUrl?: string;
  output?: 'text' | 'json';
  timeout?: number;
  defaultTextModel?: string;
  defaultSpeechTtsModel?: string;
  defaultSpeechAsrModel?: string;
  defaultImageModel?: string;
}

const VALID_OUTPUTS = new Set<string>(['text', 'json']);

export function parseConfigFile(raw: unknown): ConfigFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ConfigFile = {};

  const apiKey = obj.apiKey ?? obj.api_key;
  if (typeof apiKey === 'string') out.apiKey = apiKey;

  const region = obj.region;
  if (typeof region === 'string' && isValidRegion(region)) out.region = region;

  const genBase = obj.genBaseUrl ?? obj.gen_base_url ?? obj.baseUrl ?? obj.base_url;
  if (typeof genBase === 'string' && genBase.startsWith('http')) out.genBaseUrl = genBase;

  const apiBase = obj.apiBaseUrl ?? obj.api_base_url;
  if (typeof apiBase === 'string' && apiBase.startsWith('http')) out.apiBaseUrl = apiBase;

  if (typeof obj.output === 'string' && VALID_OUTPUTS.has(obj.output)) {
    out.output = obj.output as ConfigFile['output'];
  }
  if (typeof obj.timeout === 'number' && obj.timeout > 0) out.timeout = obj.timeout;

  for (const [k1, k2] of [
    ['defaultTextModel', 'default_text_model'],
    ['defaultSpeechTtsModel', 'default_speech_tts_model'],
    ['defaultSpeechAsrModel', 'default_speech_asr_model'],
    ['defaultImageModel', 'default_image_model'],
  ] as const) {
    const v = obj[k1] ?? obj[k2];
    if (typeof v === 'string' && v.length > 0) (out as Record<string, string>)[k1] = v;
  }

  return out;
}

// Fully resolved runtime config.
export interface Config {
  apiKey?: string;
  fileApiKey?: string;
  fileRegion?: Region;
  configPath: string;
  region: Region;
  genBaseUrl: string;
  apiBaseUrl: string;
  docsHost: string;
  output: 'text' | 'json';
  timeout: number;
  defaultTextModel?: string;
  defaultSpeechTtsModel?: string;
  defaultSpeechAsrModel?: string;
  defaultImageModel?: string;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  nonInteractive: boolean;
}

export const DEFAULTS = {
  textModel: 'step-3.7-flash',
  speechTtsModel: 'stepaudio-2.5-tts',
  speechAsrModel: 'stepaudio-2.5-asr',
  imageModel: 'step-image-edit-2',
  ttsVoice: 'lively-girl',
  timeout: 120,
  region: DEFAULT_REGION,
} as const;
