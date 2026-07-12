// Flags resolved by the parser. Global flags are typed explicitly; per-command
// flags flow in through the index signature (parser assigns camelCased keys).
export interface GlobalFlags {
  // Global
  apiKey?: string;
  region?: string;
  baseUrl?: string; // overrides the generation (StepPlan) base
  apiBaseUrl?: string; // overrides the management (public /v1) base
  output?: string; // text | json
  timeout?: number;
  quiet?: boolean;
  verbose?: boolean;
  noColor?: boolean;
  dryRun?: boolean;
  nonInteractive?: boolean;
  yes?: boolean;
  help?: boolean;
  version?: boolean;

  // Carried by the parser for commands that take positionals.
  _positional?: string[];

  // Per-command flags.
  [key: string]: unknown;
}
