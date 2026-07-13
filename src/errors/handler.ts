import { CLIError } from './base';
import { ExitCode } from './codes';
import { detectOutputFormat } from '../output/formatter';

let outputOverride: 'text' | 'json' | undefined;

export function setErrorOutputFormat(format: 'text' | 'json'): void {
  outputOverride = format;
}

export function handleError(err: unknown): never {
  if (err instanceof CLIError) {
    const format = outputOverride ?? detectOutputFormat(process.env.STEPFUN_OUTPUT);

    if (format === 'json') {
      process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + '\n');
    } else {
      process.stderr.write(`\nError: ${err.message}\n`);
      if (err.hint) {
        process.stderr.write(`\n  ${err.hint.split('\n').join('\n  ')}\n`);
      }
      process.stderr.write(`  (exit code ${err.exitCode})\n`);
    }
    process.exit(err.exitCode);
  }

  if (err instanceof Error) {
    if (
      err.name === 'AbortError' ||
      err.name === 'TimeoutError' ||
      err.message.includes('timed out')
    ) {
      return handleError(
        new CLIError('Request timed out.', ExitCode.TIMEOUT, 'Raise --timeout and retry.'),
      );
    }

    const msg = err.message.toLowerCase();

    if (err instanceof TypeError && (err.message === 'fetch failed' || msg.includes('fetch failed'))) {
      return handleError(
        new CLIError('Network request failed.', ExitCode.NETWORK, 'Check your connection / proxy.'),
      );
    }

    const isNetworkError =
      msg.includes('connection refused') ||
      msg.includes('econnrefused') ||
      msg.includes('connection reset') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('getaddrinfo') ||
      msg.includes('socket') ||
      msg.includes('etimedout') ||
      msg.includes('eai_again') ||
      msg.includes('proxy');
    if (isNetworkError) {
      return handleError(new CLIError('Network request failed.', ExitCode.NETWORK, 'Check your connection / proxy.'));
    }

    const ecode = (err as NodeJS.ErrnoException).code;
    if (typeof ecode === 'string' && ecode.startsWith('E')) {
      let hint = 'Check the file path and permissions.';
      if (ecode === 'ENOENT') hint = 'File or directory not found.';
      else if (ecode === 'EACCES' || ecode === 'EPERM') hint = 'Permission denied.';
      else if (ecode === 'ENOSPC') hint = 'Disk full.';
      return handleError(new CLIError(`File system error: ${err.message}`, ExitCode.GENERAL, hint));
    }

    process.stderr.write(`\nError: ${err.message}\n`);
    if (process.env.STEPFUN_VERBOSE === '1') {
      process.stderr.write(`${err.stack}\n`);
    }
  } else {
    process.stderr.write(`\nError: ${String(err)}\n`);
  }

  process.exit(ExitCode.GENERAL);
}
