import { spawn } from 'child_process';

export const PACKAGE_NAME = '@stepfun-ai/cli';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export interface UpdateOptions {
  currentVersion: string;
  checkOnly?: boolean;
  registry?: string;
  standalone?: boolean;
  npmCommand?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

/** `pkg` marks packaged processes with process.pkg. Such binaries are not npm installs. */
export function isStandaloneBinary(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
}

function versionParts(version: string): Array<number | string> {
  const [core, prerelease = ''] = version.replace(/^v/, '').split('-', 2);
  return [...core.split('.').map(part => Number(part) || 0), prerelease];
}

/** Compares ordinary npm versions without invoking a shell or external semver tool. */
export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return Number(a[index]) > Number(b[index]) ? 1 : -1;
  }
  const aPre = String(a[3]);
  const bPre = String(b[3]);
  if (aPre === bPre) return 0;
  if (!aPre) return 1;
  if (!bPre) return -1;
  return aPre.localeCompare(bPre);
}

function latestUrl(registry: string): string {
  return `${registry.replace(/\/$/, '')}/${encodeURIComponent(PACKAGE_NAME)}/latest`;
}

function installLatest(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // Arguments are passed directly, so package names and paths are never parsed by a shell.
    const child = spawn(command, ['install', '--global', `${PACKAGE_NAME}@latest`], {
      stdio: 'inherit',
      shell: false
    });
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 1));
  });
}

export async function runUpdate(options: UpdateOptions): Promise<number> {
  const log = options.log || console.log;
  const error = options.error || console.error;
  const registry = options.registry || DEFAULT_REGISTRY;
  let latestVersion: string;

  log(`Current version: ${options.currentVersion}`);
  try {
    const response = await fetch(latestUrl(registry));
    if (!response.ok) throw new Error(`registry returned HTTP ${response.status}`);
    const metadata = await response.json() as { version?: unknown };
    if (typeof metadata.version !== 'string' || !metadata.version) {
      throw new Error('registry response does not contain a version');
    }
    latestVersion = metadata.version;
  } catch (err: any) {
    error(`Update check failed: ${err?.message || String(err)}`);
    return 1;
  }

  log(`Latest version: ${latestVersion}`);
  const comparison = compareVersions(options.currentVersion, latestVersion);
  if (comparison >= 0) {
    log(comparison === 0 ? 'StepFun CLI is already up to date.' : 'Current version is newer than the published version.');
    return 0;
  }
  if (options.checkOnly) {
    log(`An update is available. Run \`stepfun update\` to install ${latestVersion}.`);
    return 0;
  }
  if (options.standalone ?? isStandaloneBinary()) {
    error('Automatic update is unavailable for a standalone binary. Download the latest binary from the project Releases page.');
    return 1;
  }

  log(`Updating ${PACKAGE_NAME} to ${latestVersion}...`);
  try {
    const command = options.npmCommand || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const exitCode = await installLatest(command);
    if (exitCode !== 0) {
      error(`Update failed: npm exited with code ${exitCode}.`);
      return 1;
    }
  } catch (err: any) {
    error(`Update failed: ${err?.message || String(err)}`);
    return 1;
  }
  log(`Updated successfully to ${latestVersion}.`);
  return 0;
}
