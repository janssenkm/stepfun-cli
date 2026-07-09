import { Command } from 'commander';
import prompts from 'prompts';
import { loadConfig, normalizeRegion, saveConfig, REGION_PROFILES } from '../config';
import type { Region } from '../config';
import { exportCommandSchemas } from '../cli/schema';
import { writeJson, writeResult, writeText } from '../cli/output';
import { positiveNumber } from '../cli/validation';

/** Dependencies shared by the lightweight, non-API command registrations. */
export interface CoreCommandContext {
  program: Command;
  UsageError: new (message: string, hint?: string) => Error;
  emitError: (error: unknown, output: string) => number;
  resolveOutput: (options: any) => string;
  resolveApiKey: (options: any) => string | undefined;
  resolveRegion: (options: any) => Region;
  ensureRegion: (options: any) => Promise<void>;
  resolveBaseUrl: (options: any, region: Region) => string;
  maskApiKey: (apiKey?: string) => string | undefined;
  validRegions: () => string;
  supportedModels: Record<'text' | 'speech' | 'image', string[]>;
}

/** Registers authentication, configuration, and model-discovery commands. */
export function registerCoreCommands(context: CoreCommandContext): void {
  const { program, UsageError, emitError, resolveOutput, resolveApiKey, resolveRegion, ensureRegion,
    resolveBaseUrl, maskApiKey, validRegions, supportedModels } = context;
  const config = loadConfig();
  const authCmd = program.command('auth').description('Authentication');

  authCmd.command('login').description('Authenticate and set region via interactive prompt').action(async () => {
    const parentOptions = program.opts();
    if (parentOptions.nonInteractive) {
      process.exitCode = emitError(new UsageError('auth login is interactive and cannot run with --non-interactive. Use `config set api_key <key>` (and optionally `config set region <region>`) or pass `--api-key` instead.'), resolveOutput(parentOptions));
      return;
    }
    const response = await prompts([
      { type: 'select', name: 'region', message: 'Please select your StepFun API region:', choices: [
        { title: 'StepPlan-Global (Global)', value: 'StepPlan-Global' },
        { title: 'StepPlan-CN (CN)', value: 'StepPlan-CN' }
      ], initial: Math.max(0, Object.keys(REGION_PROFILES).indexOf(config.region || 'StepPlan-Global')) },
      { type: 'password', name: 'apiKey', message: prev => `Please enter your API Key for ${prev}:` }
    ]);
    if (response.region && response.apiKey) {
      const region = normalizeRegion(response.region)!;
      saveConfig({ region, apiKey: response.apiKey, baseUrl: undefined });
      writeText(`\nRegion set to ${region} (${REGION_PROFILES[region].baseUrl})\nAPI Key saved successfully.`);
    } else writeText('Login cancelled.');
  });

  authCmd.command('logout').description('Clear saved credentials and configuration').option('--yes', 'Skip the confirmation prompt').action(async options => {
    const parentOptions = program.opts();
    if (!options.yes) {
      if (parentOptions.nonInteractive) {
        process.exitCode = emitError(new UsageError('auth logout needs confirmation but --non-interactive is set. Re-run with --yes to confirm.'), resolveOutput(parentOptions));
        return;
      }
      const response = await prompts({ type: 'confirm', name: 'confirm', message: 'This will clear ~/.stepfun-cli/config.json. Continue?', initial: false });
      if (!response.confirm) { writeText('Logout cancelled.'); return; }
    }
    saveConfig({ apiKey: undefined, region: undefined, baseUrl: undefined, output: undefined, timeout: undefined, defaultTextModel: undefined, defaultSpeechModel: undefined });
    writeText('Credentials cleared.');
  });

  authCmd.command('status').description('Show authentication status').action(async () => {
    const options = program.opts();
    await ensureRegion(options);
    const currentConfig = loadConfig();
    const apiKey = resolveApiKey(options);
    const authSource = options.apiKey ? '--api-key' : process.env.STEPFUN_API_KEY ? 'STEPFUN_API_KEY' : currentConfig.apiKey ? 'config' : 'none';
    const region = resolveRegion(options);
    const status = { authenticated: Boolean(apiKey), authSource, apiKey: maskApiKey(apiKey), region, baseUrl: resolveBaseUrl(options, region) };
    writeResult(status, resolveOutput(options), value => [
      `Authenticated: ${value.authenticated ? 'yes' : 'no'}`,
      `Auth source: ${value.authSource}`,
      ...(value.apiKey ? [`API key: ${value.apiKey}`] : []),
      `Region: ${value.region}`,
      `Base URL: ${value.baseUrl}`
    ].join('\n'));
  });

  const configCmd = program.command('config').description('CLI configuration');
  configCmd.command('set [key] [value]').description('Set a configuration value')
    .option('--key <key>', 'Configuration key')
    .option('--value <value>', 'Configuration value')
    .action((key, value, commandOptions) => {
    const options = program.opts();
    try {
      key = commandOptions.key ?? key;
      value = commandOptions.value ?? value;
      if (key === undefined || value === undefined) {
        throw new UsageError('config set requires a key and value', 'Use `config set <key> <value>` or `config set --key <key> --value <value>`.');
      }
      if (key === 'api_key') { saveConfig({ apiKey: value }); writeText('API key saved.'); }
      else if (key === 'base_url') { saveConfig({ baseUrl: value }); writeText('Base URL saved.'); }
      else if (key === 'region') {
        const region = normalizeRegion(value);
        if (!region) throw new UsageError(`Unknown region: ${value}. Valid options: ${validRegions()}`, `Choose one of: ${validRegions()}.`);
        saveConfig({ region, baseUrl: undefined }); writeText(`Region saved as ${region} (${REGION_PROFILES[region].baseUrl}).`);
      } else if (key === 'output') {
        if (value !== 'text' && value !== 'json') throw new UsageError(`Unknown output: ${value}. Valid options: text, json`, 'Output must be `text` or `json`.');
        saveConfig({ output: value }); writeText(`Output format saved as ${value}.`);
      } else if (key === 'timeout') {
        const seconds = positiveNumber(value, 'timeout', UsageError);
        saveConfig({ timeout: seconds }); writeText(`Timeout saved as ${seconds} seconds.`);
      } else if (key === 'default_text_model') { saveConfig({ defaultTextModel: value }); writeText(`Default text model saved as ${value}.`); }
      else if (key === 'default_speech_model') { saveConfig({ defaultSpeechModel: value }); writeText(`Default speech model saved as ${value}.`); }
      else throw new UsageError(`Unknown config key: ${key}`);
    } catch (error) { process.exitCode = emitError(error, resolveOutput(options)); }
    });
  configCmd.command('show').description('Show current configuration').action(() => {
    const options = program.opts();
    const current = loadConfig();
    writeResult({ ...current, apiKey: maskApiKey(current.apiKey) }, resolveOutput(options));
  });
  configCmd.command('export-schema').description('Export command schemas')
    .option('--command <path>', 'Export one command path')
    .action(commandOptions => {
      const options = program.opts();
      try {
        const schemas = exportCommandSchemas(program, commandOptions.command);
        writeResult(commandOptions.command ? schemas[0] : schemas, resolveOutput(options));
      } catch (error: any) {
        process.exitCode = emitError(new UsageError(error.message), resolveOutput(options));
      }
    });

  program.command('models').description('Model discovery').command('list').description('List supported models').action(() => {
    if (resolveOutput(program.opts()) === 'json') writeJson(supportedModels);
    else writeText(Object.entries(supportedModels).map(([category, models]) =>
      `${category[0].toUpperCase()}${category.slice(1)}:\n${models.map(model => `  - ${model}`).join('\n')}`
    ).join('\n'));
  });
}
