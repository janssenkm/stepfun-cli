import { Command } from 'commander';

const GLOBAL_HELP = '\nGlobal flags (--api-key, --output, --quiet, etc.) are always available.\nRun `stepfun --help` for the full list.';

/** Applies consistent usage and global-option guidance to the command tree. */
export function configureHelp(program: Command): void {
  program.usage('<resource> <command> [flags]');
  program.showHelpAfterError('(run with --help for usage)');
  visit(program);
}

function visit(command: Command): void {
  if (command.commands.length === 0 && command.parent) command.addHelpText('after', GLOBAL_HELP);
  for (const child of command.commands) visit(child);
}
