import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { dirname, basename, extname, resolve } from 'path';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';

export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export async function readFileBytes(path: string): Promise<Buffer> {
  return readFile(resolve(path));
}

/** Read a file and return a `data:<mime>;base64,...` URL suitable for the API. */
export async function fileToDataUrl(path: string, mime: string): Promise<string> {
  const bytes = await readFileBytes(path);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export async function saveBytes(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), data);
}

export function describeFile(path: string): { path: string; name: string; ext: string; size: number } {
  const full = resolve(path);
  return {
    path: full,
    name: basename(full),
    ext: extname(full).slice(1).toLowerCase(),
    size: existsSync(full) ? statSync(full).size : 0,
  };
}

export function ensureFileExists(path: string, label = 'file'): void {
  if (!existsSync(resolve(path))) {
    throw new CLIError(`${label} not found: ${path}`, ExitCode.USAGE);
  }
}
