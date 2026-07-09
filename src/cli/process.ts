/** Returns true for a closed downstream pipe, which is a successful CLI stop. */
export function isBrokenPipe(error: NodeJS.ErrnoException): boolean {
  return error.code === 'EPIPE';
}

/** Installs process-level behavior expected from a pipeline-friendly CLI. */
export function installProcessHandlers(): void {
  process.on('SIGINT', () => {
    process.stderr.write('\nInterrupted.\n');
    process.exit(130);
  });

  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (isBrokenPipe(error)) process.exit(0);
    throw error;
  });
}
