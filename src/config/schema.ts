import type { Config } from '../config';
import { normalizeRegion } from './regions';

const CONFIG_KEYS = new Set<keyof Config>([
  'apiKey',
  'baseUrl',
  'region',
  'output',
  'timeout',
  'defaultTextModel',
  'defaultSpeechModel',
]);

const OUTPUT_FORMATS = new Set(['text', 'json']);

export interface ConfigParseResult {
  config: Config;
  warnings: string[];
}

/** Validate untrusted JSON before it becomes runtime configuration. */
export function parseConfig(value: unknown): ConfigParseResult {
  if (!isRecord(value)) {
    return { config: {}, warnings: ['Configuration must be a JSON object; ignoring its contents.'] };
  }

  const config: Config = {};
  const warnings: string[] = [];

  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key as keyof Config)) {
      warnings.push(`Unknown configuration field "${key}" was ignored.`);
    }
  }

  assignString(value, config, 'apiKey', warnings);
  assignString(value, config, 'baseUrl', warnings);
  assignString(value, config, 'defaultTextModel', warnings);
  assignString(value, config, 'defaultSpeechModel', warnings);

  if (value.region !== undefined) {
    const region = typeof value.region === 'string' ? normalizeRegion(value.region) : undefined;
    if (region) {
      config.region = region;
    } else {
      warnings.push('Invalid configuration field "region" was ignored.');
    }
  }

  if (value.output !== undefined) {
    if (typeof value.output === 'string' && OUTPUT_FORMATS.has(value.output)) {
      config.output = value.output;
    } else {
      warnings.push('Invalid configuration field "output" was ignored.');
    }
  }

  if (value.timeout !== undefined) {
    if (typeof value.timeout === 'number' && Number.isFinite(value.timeout) && value.timeout > 0) {
      config.timeout = value.timeout;
    } else {
      warnings.push('Invalid configuration field "timeout" was ignored.');
    }
  }

  return { config, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assignString(
  source: Record<string, unknown>,
  target: Config,
  key: 'apiKey' | 'baseUrl' | 'defaultTextModel' | 'defaultSpeechModel',
  warnings: string[]
): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value === 'string' && value.length > 0) {
    target[key] = value;
  } else {
    warnings.push(`Invalid configuration field "${key}" was ignored.`);
  }
}
