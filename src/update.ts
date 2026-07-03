/** NPM package users should update when running the standard distribution. */
export const PACKAGE_NAME = '@stepfun-ai/cli';

/** `pkg` marks packaged processes with process.pkg. */
export function isStandaloneBinary(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

/** Dependencies used to render update guidance without side effects. */
export interface UpdateOptions {
  currentVersion: string;
  standalone?: boolean;
  write?: (message: string) => void;
}

/**
 * Print an explicit update command without querying the registry or modifying
 * the user's global npm installation.
 */
export function runUpdate(options: UpdateOptions): number {
  const write = options.write || ((message: string) => process.stderr.write(message));
  write(`Current version: ${options.currentVersion}\n\n`);
  if (options.standalone ?? isStandaloneBinary()) {
    write('Automatic update is unavailable for a standalone binary.\n');
    write('Download the latest binary from the project Releases page.\n\n');
    return 0;
  }
  write('Run:\n');
  write(`  npm update -g ${PACKAGE_NAME}\n\n`);
  return 0;
}
