import { readFile } from 'fs/promises';
import { basename } from 'path';
import { requestJson } from '../client/http';
import { genUrl } from '../client/urls';
import type { Config } from '../config/schema';

export interface ImageData {
  b64_json?: string;
  url?: string;
  seed?: number;
  finish_reason?: string;
}

export interface ImageResponse {
  created?: number;
  data: ImageData[];
}

export async function generateImage(
  config: Config,
  body: Record<string, unknown>,
): Promise<ImageResponse> {
  return requestJson<ImageResponse>(config, {
    url: genUrl(config, '/images/generations'),
    method: 'POST',
    body,
  });
}

export interface EditFields {
  model: string;
  imagePath: string;
  prompt: string;
  seed?: number;
  steps?: number;
  cfgScale?: number;
  negativePrompt?: string;
  textMode?: boolean;
  responseFormat?: string;
}

export async function editImage(config: Config, f: EditFields): Promise<ImageResponse> {
  const fd = new FormData();
  fd.append('model', f.model);
  fd.append('image', new Blob([await readFile(f.imagePath)]), basename(f.imagePath));
  fd.append('prompt', f.prompt);
  if (f.seed !== undefined) fd.append('seed', String(f.seed));
  if (f.steps !== undefined) fd.append('steps', String(f.steps));
  if (f.cfgScale !== undefined) fd.append('cfg_scale', String(f.cfgScale));
  if (f.negativePrompt !== undefined) fd.append('negative_prompt', f.negativePrompt);
  if (f.textMode !== undefined) fd.append('text_mode', String(f.textMode));
  if (f.responseFormat !== undefined) fd.append('response_format', f.responseFormat);

  return requestJson<ImageResponse>(config, {
    url: genUrl(config, '/images/edits'),
    method: 'POST',
    body: fd,
  });
}
