import { defineCommand } from '../../command';
import { readConfigFile, writeConfigFile } from '../../config/loader';
import { REGIONS, parseRegion, type Region } from '../../config/regions';
import { isInteractive } from '../../utils/env';
import { promptText } from '../../utils/prompt';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'auth login',
  description: 'Save a StepFun StepPlan API key',
  usage: 'stepfun auth login [--api-key <key>] [--region <region>]',
  options: [
    { flag: '--api-key <key>', description: 'API key (skip the prompt)' },
    { flag: '--region <region>', description: 'Global | CN (case-insensitive)' },
  ],
  examples: ['stepfun auth login --api-key sk-... --region Global'],
  async run(_config, flags) {
    let apiKey = flags.apiKey as string | undefined;
    const requestedRegion = flags.region as string | undefined;
    let region: Region | undefined = requestedRegion ? parseRegion(requestedRegion) : undefined;

    if (requestedRegion && !region) {
      throw new CLIError(
        `Invalid region "${requestedRegion}". Valid: ${Object.keys(REGIONS).join(', ')}`,
        ExitCode.USAGE,
      );
    }

    if (!apiKey && isInteractive({ nonInteractive: flags.nonInteractive as boolean })) {
      apiKey = (await promptText({ message: 'Paste your StepFun API key' })).trim();
      if (!apiKey) {
        process.stderr.write('Login cancelled.\n');
        process.exit(1);
      }
    }
    if (!apiKey) {
      throw new CLIError('No API key provided.', ExitCode.USAGE, 'Pass --api-key or run interactively.');
    }

    if (!region && isInteractive({ nonInteractive: flags.nonInteractive as boolean })) {
      const input = (
        await promptText({ message: 'Region', defaultValue: 'Global' })
      ).trim();
      region = parseRegion(input);
      if (!region) {
        throw new CLIError('Invalid region. Valid: Global, CN.', ExitCode.USAGE);
      }
    }

    const cur = readConfigFile();
    cur.apiKey = apiKey;
    if (region) cur.region = region;
    await writeConfigFile(cur as Record<string, unknown>);

    const resolved = region || cur.region || 'Global';
    process.stderr.write(`Logged in. Region: ${resolved}\n`);
    process.stderr.write(`Key: ${apiKey.slice(0, 6)}…${apiKey.slice(-4)}\n`);
  },
});
