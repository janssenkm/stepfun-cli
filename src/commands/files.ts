import { Command } from 'commander';
import fs from 'fs';
import prompts from 'prompts';
import { ENDPOINTS, fileContentEndpoint, fileEndpoint } from '../client/endpoints';
import { FileService } from '../files/service';
import type { FileObject, FilePurpose } from '../files/types';
import type { Region } from '../config';
import { writeJson, writeProgress, writeResult, writeText } from '../cli/output';
import { requireExactlyOne } from '../cli/validation';

const FILE_PURPOSES = new Set<FilePurpose>([
  'file-extract', 'retrieval-text', 'retrieval-image', 'storage'
]);

export interface FileCommandContext {
  program: Command;
  UsageError: new (message: string, hint?: string) => Error;
  emitError: (error: unknown, output: string) => number;
  resolveOutput: (options: any) => string;
  resolveRegion: (options: any) => Region;
  ensureRegion: (options: any) => Promise<void>;
  getFileService: (options: any) => FileService;
  warnIfUnsupportedNonChat: (region: Region, quiet: boolean, commandName: string) => void;
  dryRun: (options: any, command: string, method: string, endpoint: string, detail: Record<string, unknown>) => void;
  fileStat: (filePath: string) => { path: string; size: number } | { path: string; error: string };
}

/** Registers file lifecycle and parsed-content commands. */
export function registerFileCommands(context: FileCommandContext): void {
  const { program, UsageError, emitError, resolveOutput, resolveRegion, ensureRegion, getFileService,
    warnIfUnsupportedNonChat, dryRun, fileStat } = context;
  const file = program.command('file').description('File storage and parsed content');

  file.command('upload')
    .description('Upload a local file or remote URL')
    .option('--file <path>', 'Local file path')
    .option('--url <url>', 'Remote file URL')
    .requiredOption('--purpose <purpose>', 'Upload purpose: file-extract, retrieval-text, retrieval-image, storage')
    .action(async options => {
      const global = program.opts();
      try {
        requireExactlyOne(options, ['file', 'url'], UsageError);
        const purpose = parsePurpose(options.purpose, UsageError);
        if (options.url) validateRemoteUrl(options.url, UsageError);
        if (options.file && !global.dryRun && !fs.existsSync(options.file)) {
          throw new UsageError(`File not found: ${options.file}`);
        }
        if (options.file && !global.dryRun) validateLocalFile(options.file, purpose, UsageError);
        if (global.dryRun) {
          dryRun(global, 'file upload', 'POST', ENDPOINTS.files, {
            purpose,
            ...(options.file ? { file: fileStat(options.file) } : { url: options.url })
          });
          return;
        }

        await ensureRegion(global);
        const region = resolveRegion(global);
        warnIfUnsupportedNonChat(region, global.quiet, 'file upload');
        warnPurpose(region, purpose, global.quiet);
        const service = getFileService(global);
        const result = options.file
          ? await service.uploadLocal(options.file, purpose)
          : await service.uploadUrl(options.url, purpose);
        if (global.quiet) writeText(result.id);
        else printResult(result, resolveOutput(global));
      } catch (error) {
        process.exitCode = emitError(error, resolveOutput(global));
      }
    });

  file.command('list').description('List uploaded files').action(async () => {
    const global = program.opts();
    try {
      if (global.dryRun) {
        dryRun(global, 'file list', 'GET', ENDPOINTS.files, {});
        return;
      }
      await ensureRegion(global);
      const region = resolveRegion(global);
      warnIfUnsupportedNonChat(region, global.quiet, 'file list');
      const result = await getFileService(global).list();
      if (resolveOutput(global) === 'json') writeJson(result);
      else printFileTable(result.data || []);
    } catch (error) {
      process.exitCode = emitError(error, resolveOutput(global));
    }
  });

  file.command('get <file-id>').description('Get file metadata').action(async fileId => {
    const global = program.opts();
    try {
      if (global.dryRun) {
        dryRun(global, 'file get', 'GET', fileEndpoint(fileId), { file_id: fileId });
        return;
      }
      await ensureRegion(global);
      const region = resolveRegion(global);
      warnIfUnsupportedNonChat(region, global.quiet, 'file get');
      printResult(await getFileService(global).get(fileId), resolveOutput(global));
    } catch (error) {
      process.exitCode = emitError(error, resolveOutput(global));
    }
  });

  file.command('content <file-id>')
    .description('Retrieve parsed text for a file-extract file')
    .option('-o, --out <path>', 'Write parsed content to a file')
    .action(async (fileId, options) => {
      const global = program.opts();
      try {
        if (global.dryRun) {
          dryRun(global, 'file content', 'GET', fileContentEndpoint(fileId), {
            file_id: fileId,
            ...(options.out ? { output_file: options.out } : {})
          });
          return;
        }
        await ensureRegion(global);
        const region = resolveRegion(global);
        warnIfUnsupportedNonChat(region, global.quiet, 'file content');
        warnPurpose(region, 'file-extract', global.quiet);
        const content = await getFileService(global).content(fileId);
        if (options.out) {
          fs.writeFileSync(options.out, content, 'utf8');
          writeProgress(`Content written to ${options.out}.`, global.quiet);
        } else if (resolveOutput(global) === 'json') {
          writeJson({ file_id: fileId, content });
        } else {
          writeText(content);
        }
      } catch (error) {
        process.exitCode = emitError(error, resolveOutput(global));
      }
    });

  file.command('delete <file-id>')
    .description('Delete an uploaded file')
    .option('--yes', 'Skip confirmation')
    .action(async (fileId, options) => {
      const global = program.opts();
      try {
        if (!options.yes && !global.dryRun) {
          if (global.nonInteractive) {
            throw new UsageError('file delete needs confirmation but --non-interactive is set. Re-run with --yes.');
          }
          const response = await prompts({
            type: 'confirm', name: 'confirm', message: `Delete file ${fileId}?`, initial: false
          });
          if (!response.confirm) {
            if (!global.quiet) writeText('Delete cancelled.');
            return;
          }
        }
        if (global.dryRun) {
          dryRun(global, 'file delete', 'DELETE', fileEndpoint(fileId), { file_id: fileId });
          return;
        }
        await ensureRegion(global);
        const region = resolveRegion(global);
        warnIfUnsupportedNonChat(region, global.quiet, 'file delete');
        const result = await getFileService(global).delete(fileId);
        if (global.quiet) writeText('deleted');
        else printResult(result, resolveOutput(global));
      } catch (error) {
        process.exitCode = emitError(error, resolveOutput(global));
      }
    });
}

function parsePurpose(value: string, UsageError: new (message: string, hint?: string) => Error): FilePurpose {
  if (!FILE_PURPOSES.has(value as FilePurpose)) {
    throw new UsageError(`Unknown file purpose: ${value}. Valid options: ${Array.from(FILE_PURPOSES).join(', ')}`);
  }
  return value as FilePurpose;
}

function validateRemoteUrl(value: string, UsageError: new (message: string, hint?: string) => Error): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new UsageError(`Invalid --url: ${value}`, '--url must be an HTTP or HTTPS URL.');
  }
}

function warnPurpose(region: Region, purpose: FilePurpose, quiet: boolean): void {
  if (quiet || region.endsWith('-CN') || purpose === 'storage') return;
  process.stderr.write(
    `Note: official Global upload documentation currently guarantees purpose=storage only; ` +
    `${purpose} may not be available in ${region}.\n`
  );
}

function printResult(value: unknown, output: string): void {
  writeResult(value, output);
}

function printFileTable(files: FileObject[]): void {
  if (files.length === 0) {
    writeText('No files found.');
    return;
  }
  const rows = files.map(file => ({
    ID: file.id,
    FILENAME: file.filename || '',
    PURPOSE: file.purpose || '',
    SIZE: formatBytes(file.bytes || 0),
    STATUS: file.status || '',
    CREATED: file.created_at ? new Date(file.created_at * 1000).toISOString() : ''
  }));
  const keys = Object.keys(rows[0]) as Array<keyof typeof rows[0]>;
  const widths = keys.map(key => Math.max(key.length, ...rows.map(row => String(row[key]).length)));
  writeText([
    keys.map((key, i) => key.padEnd(widths[i])).join('  '),
    rows.map(row => keys.map((key, i) => String(row[key]).padEnd(widths[i])).join('  ')).join('\n')
  ].join('\n'));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateLocalFile(
  filePath: string,
  purpose: FilePurpose,
  UsageError: new (message: string, hint?: string) => Error
): void {
  const extension = pathExtension(filePath);
  const rules: Record<FilePurpose, { extensions: Set<string>; maxBytes: number }> = {
    'file-extract': { extensions: new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'html', 'htm', 'xml']), maxBytes: 64 * 1024 * 1024 },
    'retrieval-text': { extensions: new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'html', 'htm', 'xml']), maxBytes: 64 * 1024 * 1024 },
    'retrieval-image': { extensions: new Set(['jpg', 'jpeg', 'png']), maxBytes: 64 * 1024 * 1024 },
    storage: { extensions: new Set(['mp4', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp3', 'wav']), maxBytes: 128 * 1024 * 1024 }
  };
  const rule = rules[purpose];
  if (!rule.extensions.has(extension)) {
    throw new UsageError(`Unsupported file type .${extension || '(none)'} for purpose ${purpose}.`);
  }
  const size = fs.statSync(filePath).size;
  if (size > rule.maxBytes) {
    throw new UsageError(`File is too large for purpose ${purpose}: ${size} bytes.`);
  }
}

function pathExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot === -1 ? '' : filePath.slice(dot + 1).toLowerCase();
}
