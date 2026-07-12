import type { GlobalFlags } from './types/flags';
import type { Config } from './config/schema';

export interface OptionDef {
  flag: string;
  description: string;
  type?: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
}

export interface Command {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  apiDocs?: string;
  execute(config: Config, flags: GlobalFlags): Promise<void>;
}

export interface CommandSpec {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  apiDocs?: string;
  run(config: Config, flags: GlobalFlags): Promise<void>;
}

export function defineCommand(spec: CommandSpec): Command {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    options: spec.options,
    examples: spec.examples,
    apiDocs: spec.apiDocs,
    execute: spec.run,
  };
}

// Global flags shared by every command — drives the parser's type resolution
// (boolean vs. value) and lets scanCommandPath skip flag values when locating
// the command path.
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: '--api-key <key>', description: 'StepFun API key (overrides config)' },
  { flag: '--region <region>', description: 'StepPlan region: StepPlan-Global, StepPlan-CN' },
  { flag: '--base-url <url>', description: 'Override the generation (StepPlan) base URL' },
  { flag: '--api-base-url <url>', description: 'Override the management (public /v1) base URL' },
  { flag: '--output <format>', description: 'Output format: text, json' },
  { flag: '--timeout <seconds>', description: 'Request timeout in seconds', type: 'number' },
  { flag: '--quiet', description: 'Suppress non-essential output' },
  { flag: '--verbose', description: 'Print HTTP request/response details' },
  { flag: '--no-color', description: 'Disable ANSI colors' },
  { flag: '--dry-run', description: 'Show the request that would be sent without calling the API' },
  { flag: '--non-interactive', description: 'Disable interactive prompts (CI/agent mode)' },
  { flag: '--yes', description: 'Answer yes to confirmation prompts' },
  { flag: '--help', description: 'Show help' },
  { flag: '--version', description: 'Print version' },
];
