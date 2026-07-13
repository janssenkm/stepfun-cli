import { scanCommandPath, parseFlags } from './args';
import { registry } from './registry';
import { GLOBAL_OPTIONS } from './command';
import { handleError, setErrorOutputFormat } from './errors/handler';
import { loadConfig, readConfigFile } from './config/loader';
import { DEFAULT_REGION, isValidRegion, type Region } from './config/regions';
import { CLIError } from './errors/base';
import { ExitCode } from './errors/codes';
import { CLI_VERSION } from './version';
import { detectOutputFormat } from './output/formatter';

process.on('SIGINT', () => {
  process.stderr.write('\nInterrupted.\n');
  process.exit(130);
});

process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  else throw e;
});

// Commands that never need an API key.
const NO_AUTH_SETUP: string[][] = [
  ['auth', 'login'],
  ['auth', 'status'],
  ['auth', 'logout'],
  ['config', 'show'],
  ['config', 'set'],
];

function helpRegion(): Region {
  const file = readConfigFile();
  const r =
    (process.argv.find((_, i, a) => a[i - 1] === '--region')) ||
    process.env.STEPFUN_REGION ||
    file.region ||
    DEFAULT_REGION;
  return isValidRegion(r) ? (r as Region) : DEFAULT_REGION;
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`stepfun ${CLI_VERSION}\n`);
    return;
  }

  const commandPath = scanCommandPath(argv, GLOBAL_OPTIONS);

  // `stepfun help [path...]`
  if (commandPath[0] === 'help') {
    registry.printHelp(commandPath.slice(1), process.stderr, helpRegion());
    return;
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    registry.printHelp(commandPath, process.stderr, helpRegion());
    return;
  }

  // No command → root help + login hint.
  if (commandPath.length === 0) {
    registry.printHelp([], process.stderr, helpRegion());
    const file = readConfigFile();
    if (!file.apiKey) {
      process.stderr.write('\n  Not logged in. Run: stepfun auth login --api-key <key> --region <region>\n');
    }
    return;
  }

  const { command, extra } = registry.resolve(commandPath);
  const flags = parseFlags(argv, [...GLOBAL_OPTIONS, ...(command.options ?? [])]);
  if (extra.length > 0) (flags as Record<string, unknown>)._positional = extra;

  // Make explicit CLI output selection available even if config loading fails.
  setErrorOutputFormat(detectOutputFormat((flags.output as string | undefined) ?? process.env.STEPFUN_OUTPUT));

  const config = loadConfig(flags);
  setErrorOutputFormat(config.output);

  const needsAuth = !NO_AUTH_SETUP.some((prefix) => prefix.every((c, i) => commandPath[i] === c));
  if (needsAuth && !config.apiKey && !config.dryRun) {
    throw new CLIError(
      'No API key configured.',
      ExitCode.AUTH,
      'Run: stepfun auth login   — or set STEPFUN_API_KEY / pass --api-key',
    );
  }

  await command.execute(config, flags);
}

main().catch(handleError);
