// MIME / extension helpers for image and audio attachments.

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pcm: 'audio/pcm',
};

export function imageMimeForExt(ext: string): string {
  return IMAGE_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

export function audioMimeForExt(ext: string): string {
  return AUDIO_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

// ASR audio.input.format.type values supported by StepFun.
export type AsrFormatType = 'ogg' | 'mp3' | 'wav' | 'pcm';

export function asrFormatTypeForExt(ext: string): AsrFormatType {
  const e = ext.toLowerCase();
  if (e === 'ogg' || e === 'mp3' || e === 'wav' || e === 'pcm') return e;
  // Fallback: assume wav for unknown containers.
  return 'wav';
}

const EXT_FROM_RESPONSE_FORMAT: Record<string, string> = {
  mp3: 'mp3',
  wav: 'wav',
  flac: 'flac',
  opus: 'opus',
  pcm: 'pcm',
};

export function extForAudioFormat(format: string): string {
  return EXT_FROM_RESPONSE_FORMAT[format.toLowerCase()] || 'mp3';
}
