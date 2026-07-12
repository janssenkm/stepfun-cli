import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, extname, basename } from 'path';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import type { ImageData, ImageResponse } from '../../api/image';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

function extFromUrl(url: string): string {
  const m = url.split('?')[0]!.match(/\.(png|jpe?g|webp|gif)$/i);
  return m ? m[1]!.toLowerCase() : 'png';
}

// When --out is given alongside a multi-image response, disambiguate results
// after the first so they don't all clobber the same path.
function resolveOut(out: string, index: number): string {
  if (index === 0) return out;
  const ext = extname(out);
  const stem = ext ? basename(out, ext) : basename(out);
  return join(dirname(out), `${stem}-${index + 1}${ext}`);
}

export interface SaveOpts {
  out?: string; // exact path
  outDir?: string; // directory
  outPrefix?: string; // filename prefix (default: image)
}

/** Persist one image result. Returns the path written (or the URL if nothing to save). */
export async function saveImage(
  item: ImageData,
  index: number,
  opts: SaveOpts,
): Promise<string> {
  if (item.b64_json) {
    const ext = 'png';
    const path = opts.out
      ? resolveOut(opts.out, index)
      : join(opts.outDir ?? '.', `${opts.outPrefix ?? 'image'}-${index + 1}.${ext}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(item.b64_json, 'base64'));
    return path;
  }

  if (item.url) {
    // Download the CDN URL (valid ~2h per docs).
    const ext = opts.out ? extname(opts.out).slice(1) || extFromUrl(item.url) : extFromUrl(item.url);
    const path = opts.out
      ? resolveOut(opts.out, index)
      : join(opts.outDir ?? '.', `${opts.outPrefix ?? 'image'}-${index + 1}.${ext}`);
    const res = await fetch(item.url);
    if (!res.ok) throw new CLIError(`Failed to download image (HTTP ${res.status})`, ExitCode.GENERAL);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
    return path;
  }

  throw new CLIError('Image response had neither b64_json nor url.', ExitCode.GENERAL);
}

/**
 * Save (if --out/--out-dir given) and emit image results under the standard
 * output contract. Shared by `image generate` and `image edit`.
 */
export async function emitImages(config: Config, res: ImageResponse, flags: GlobalFlags): Promise<void> {
  const wantSave = !!(flags.out || flags.outDir);

  if (wantSave) {
    const paths: string[] = [];
    for (let i = 0; i < res.data.length; i++) {
      paths.push(
        await saveImage(res.data[i]!, i, {
          out: flags.out as string | undefined,
          outDir: flags.outDir as string | undefined,
          outPrefix: flags.outPrefix as string | undefined,
        }),
      );
    }
    if (config.output === 'json') {
      const meta = {
        created: res.created,
        saved: paths,
        data: res.data.map((d) => ({ seed: d.seed, finish_reason: d.finish_reason })),
      };
      process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
    } else if (config.quiet) {
      process.stdout.write(paths.join('\n') + '\n');
    } else {
      for (const p of paths) process.stderr.write(`Saved ${p}\n`);
    }
    return;
  }

  if (config.output === 'json') {
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    return;
  }
  for (const [i, d] of res.data.entries()) {
    process.stdout.write(`[${i + 1}] ${d.url ? d.url : `<b64 ${d.b64_json?.length ?? 0} chars>`} finish=${d.finish_reason ?? '?'}\n`);
  }
}
