import { defineCommand } from '../../command';
import { readConfigFile } from '../../config/loader';
import { REGIONS, DEFAULT_REGION, type Region } from '../../config/regions';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { maskKey } from '../../utils/redact';

export default defineCommand({
  name: 'auth status',
  description: 'Show current authentication and StepPlan region',
  usage: 'stepfun auth status',
  async run(_config, flags) {
    const file = readConfigFile();
    const region = (file.region || DEFAULT_REGION) as Region;
    const profile = REGIONS[region];
    const format = detectOutputFormat(flags.output as string | undefined);

    const data = {
      loggedIn: !!file.apiKey,
      apiKey: maskKey(file.apiKey),
      region,
      generationBase: profile.genBase,
      managementBase: profile.apiBase,
      overrides: {
        genBaseUrl: file.genBaseUrl ?? null,
        apiBaseUrl: file.apiBaseUrl ?? null,
      },
      configPath: '(see config show)',
    };

    if (format === 'json') {
      process.stdout.write(formatOutput(data, format) + '\n');
    } else {
      process.stdout.write(`Auth status\n`);
      process.stdout.write(`  Logged in:        ${data.loggedIn ? 'yes' : 'no'}\n`);
      process.stdout.write(`  API key:          ${data.apiKey}\n`);
      process.stdout.write(`  Region:           ${region}\n`);
      process.stdout.write(`  Generation base:  ${profile.genBase}\n`);
      process.stdout.write(`  Management base:  ${profile.apiBase}\n`);
      if (file.genBaseUrl) process.stdout.write(`  gen override:     ${file.genBaseUrl}\n`);
      if (file.apiBaseUrl) process.stdout.write(`  api override:     ${file.apiBaseUrl}\n`);
    }
  },
});
