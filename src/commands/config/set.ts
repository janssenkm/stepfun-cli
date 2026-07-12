import { defineCommand } from '../../command';
import { readConfigFile, writeConfigFile } from '../../config/loader';
import { isValidRegion } from '../../config/regions';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { formatOutput } from '../../output/formatter';

const SCHEMA: Record<
  string,
  { validate: (v: string) => unknown; help: string }
> = {
  apiKey: { validate: (v) => v, help: 'API key string' },
  region: {
    validate: (v) => {
      if (!isValidRegion(v)) throw new CLIError(`region must be StepPlan-Global or StepPlan-CN`, ExitCode.USAGE);
      return v;
    },
    help: 'StepPlan-Global | StepPlan-CN',
  },
  genBaseUrl: {
    validate: (v) => {
      if (!/^https?:\/\//.test(v)) throw new CLIError('must be an http(s) URL', ExitCode.USAGE);
      return v;
    },
    help: 'Override generation base URL',
  },
  apiBaseUrl: {
    validate: (v) => {
      if (!/^https?:\/\//.test(v)) throw new CLIError('must be an http(s) URL', ExitCode.USAGE);
      return v;
    },
    help: 'Override management base URL',
  },
  output: {
    validate: (v) => {
      if (v !== 'text' && v !== 'json') throw new CLIError('output must be text or json', ExitCode.USAGE);
      return v;
    },
    help: 'text | json',
  },
  timeout: {
    validate: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new CLIError('timeout must be a positive number', ExitCode.USAGE);
      return n;
    },
    help: 'Request timeout (seconds)',
  },
  defaultTextModel: { validate: (v) => v, help: 'Default chat model' },
  defaultSpeechTtsModel: { validate: (v) => v, help: 'Default TTS model' },
  defaultSpeechAsrModel: { validate: (v) => v, help: 'Default ASR model' },
  defaultImageModel: { validate: (v) => v, help: 'Default image model' },
};

export default defineCommand({
  name: 'config set',
  description: 'Set a configuration value',
  usage: 'stepfun config set --key <key> --value <value>',
  options: [
    { flag: '--key <key>', description: `Config key: ${Object.keys(SCHEMA).join(', ')}`, required: true },
    { flag: '--value <value>', description: 'Value to set', required: true },
  ],
  examples: ['stepfun config set --key region --value StepPlan-CN'],
  async run(_config, flags) {
    const key = flags.key as string | undefined;
    const value = flags.value as string | undefined;
    if (!key || value === undefined) {
      throw new CLIError('Both --key and --value are required.', ExitCode.USAGE);
    }
    const def = SCHEMA[key];
    if (!def) {
      throw new CLIError(
        `Unknown key "${key}". Valid: ${Object.keys(SCHEMA).join(', ')}`,
        ExitCode.USAGE,
      );
    }
    const parsed = def.validate(value);

    const cur = readConfigFile();
    (cur as Record<string, unknown>)[key] = parsed;
    await writeConfigFile(cur as Record<string, unknown>);

    process.stdout.write(formatOutput({ [key]: parsed }, 'text') + '\n');
  },
});
