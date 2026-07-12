import { defineCommand } from '../../command';
import { editImage } from '../../api/image';
import { dryRun } from '../../output/formatter';
import { ensureFileExists } from '../../utils/fs';
import { emitImages } from './_save';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { maxLength, numberRange, oneOf, mutuallyExclusive } from '../../utils/validation';

export default defineCommand({
  name: 'image edit',
  description: 'Edit an image from a reference image + prompt (POST /images/edits)',
  usage: 'stepfun image edit --image <path> --prompt <text> [flags]',
  options: [
    { flag: '--image <path>', description: 'Input image (local file)', required: true },
    { flag: '--prompt <text>', description: 'Edit description (≤512 chars)', required: true },
    { flag: '--model <model>', description: 'Model id (default: step-image-edit-2)' },
    { flag: '--seed <n>', description: 'Random seed', type: 'number' },
    { flag: '--steps <n>', description: 'Steps (1–50, default 8)', type: 'number' },
    { flag: '--cfg-scale <n>', description: 'CFG scale (1.0–10.0)', type: 'number' },
    { flag: '--negative-prompt <text>', description: 'Negative prompt (≤512 chars)' },
    { flag: '--text-mode', description: 'Optimize for text rendering' },
    { flag: '--response-format <fmt>', description: 'b64_json | url (default: b64_json)' },
    { flag: '--out <path>', description: 'Save to this exact path' },
    { flag: '--out-dir <dir>', description: 'Save into this directory' },
    { flag: '--out-prefix <prefix>', description: 'Filename prefix (default: image)' },
  ],
  examples: ['stepfun image edit --image in.png --prompt "make it night time" --out edited.png'],
  apiDocs: '/docs/en/api-reference/images/edits',
  async run(config, flags) {
    const imagePath = flags.image as string | undefined;
    const prompt = flags.prompt as string | undefined;
    if (!imagePath) throw new CLIError('--image is required.', ExitCode.USAGE);
    if (!prompt) throw new CLIError('--prompt is required.', ExitCode.USAGE);
    ensureFileExists(imagePath, 'image');

    const model = (flags.model as string | undefined) || config.defaultImageModel || 'step-image-edit-2';
    const responseFormat = (flags.responseFormat as string | undefined) || 'b64_json';
    maxLength('--prompt', prompt, 512);
    maxLength('--negative-prompt', flags.negativePrompt as string | undefined, 512);
    oneOf('--response-format', responseFormat, ['b64_json', 'url']);
    numberRange('--steps', flags.steps as number | undefined, 1, 50, true);
    numberRange('--cfg-scale', flags.cfgScale as number | undefined, 1, 10);
    mutuallyExclusive('--out', flags.out, '--out-dir', flags.outDir);

    if (dryRun(config, { method: 'POST', path: '/images/edits', multipart: true, request: { image: imagePath, prompt, model } })) return;

    const res = await editImage(config, {
      model,
      imagePath,
      prompt,
      seed: flags.seed !== undefined ? Number(flags.seed) : undefined,
      steps: flags.steps !== undefined ? Number(flags.steps) : undefined,
      cfgScale: flags.cfgScale !== undefined ? Number(flags.cfgScale) : undefined,
      negativePrompt: flags.negativePrompt as string | undefined,
      textMode: flags.textMode !== undefined ? !!flags.textMode : undefined,
      responseFormat,
    });

    await emitImages(config, res, flags);
  },
});
