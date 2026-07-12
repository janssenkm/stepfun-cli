import { defineCommand } from '../../command';
import { generateImage } from '../../api/image';
import { dryRun } from '../../output/formatter';
import { emitImages } from './_save';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { maxLength, numberRange, oneOf, mutuallyExclusive } from '../../utils/validation';

export default defineCommand({
  name: 'image generate',
  description: 'Generate an image from a prompt (POST /images/generations)',
  usage: 'stepfun image generate --prompt <text> [flags]',
  options: [
    { flag: '--prompt <text>', description: 'Image description (≤512 chars)', required: true },
    { flag: '--model <model>', description: 'Model id (default: step-image-edit-2)' },
    { flag: '--size <size>', description: 'e.g. 1024x1024, 768x1360, 1360x768' },
    { flag: '--n <n>', description: 'Number of images (server currently supports 1)', type: 'number' },
    { flag: '--seed <n>', description: 'Random seed', type: 'number' },
    { flag: '--steps <n>', description: 'Generation steps (1–50, default 8)', type: 'number' },
    { flag: '--cfg-scale <n>', description: 'CFG scale (1.0–10.0)', type: 'number' },
    { flag: '--negative-prompt <text>', description: 'Negative prompt (≤512 chars)' },
    { flag: '--text-mode', description: 'Optimize for text rendering' },
    { flag: '--response-format <fmt>', description: 'b64_json | url (default: b64_json)' },
    { flag: '--out <path>', description: 'Save to this exact path' },
    { flag: '--out-dir <dir>', description: 'Save into this directory' },
    { flag: '--out-prefix <prefix>', description: 'Filename prefix (default: image)' },
  ],
  examples: ['stepfun image generate --prompt "a serene alpine lake at sunset" --out out.png'],
  apiDocs: '/docs/en/api-reference/images/image',
  async run(config, flags) {
    const prompt = flags.prompt as string | undefined;
    if (!prompt) throw new CLIError('--prompt is required.', ExitCode.USAGE);

    const model = (flags.model as string | undefined) || config.defaultImageModel || 'step-image-edit-2';
    const responseFormat = (flags.responseFormat as string | undefined) || 'b64_json';
    maxLength('--prompt', prompt, 512);
    maxLength('--negative-prompt', flags.negativePrompt as string | undefined, 512);
    oneOf('--response-format', responseFormat, ['b64_json', 'url']);
    numberRange('--n', flags.n as number | undefined, 1, 1, true);
    numberRange('--steps', flags.steps as number | undefined, 1, 50, true);
    numberRange('--cfg-scale', flags.cfgScale as number | undefined, 1, 10);
    mutuallyExclusive('--out', flags.out, '--out-dir', flags.outDir);
    const body: Record<string, unknown> = { model, prompt, response_format: responseFormat };
    if (flags.size) body.size = flags.size;
    if (flags.n !== undefined) body.n = Number(flags.n);
    if (flags.seed !== undefined) body.seed = Number(flags.seed);
    if (flags.steps !== undefined) body.steps = Number(flags.steps);
    if (flags.cfgScale !== undefined) body.cfg_scale = Number(flags.cfgScale);
    if (flags.negativePrompt !== undefined) body.negative_prompt = flags.negativePrompt;
    if (flags.textMode !== undefined) body.text_mode = !!flags.textMode;

    if (dryRun(config, { method: 'POST', path: '/images/generations', body })) return;

    const res = await generateImage(config, body);
    await emitImages(config, res, flags);
  },
});
