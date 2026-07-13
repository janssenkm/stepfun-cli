import { requestBytes, requestStream } from '../client/http';
import { parseSSE } from '../client/sse';
import { genUrl } from '../client/urls';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import type { Config } from '../config/schema';

export interface SpeechOpts {
  model: string;
  input: string;
  voice: string;
  responseFormat?: string;
  speed?: number;
  volume?: number;
  voiceLabel?: Record<string, string>;
  instruction?: string;
  sampleRate?: number;
  pronunciationMap?: string[];
  markdownFilter?: boolean;
  streamFormat?: 'sse' | 'audio';
}

/** Synthesize speech. Returns the full audio buffer; onChunk fires per chunk
 *  (useful for streaming decoded chunks to stdout as they arrive). */
export async function synthesize(
  config: Config,
  opts: SpeechOpts,
  onChunk?: (b: Buffer) => void,
): Promise<Buffer> {
  const body: Record<string, unknown> = { model: opts.model, input: opts.input, voice: opts.voice };
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (opts.speed !== undefined) body.speed = opts.speed;
  if (opts.volume !== undefined) body.volume = opts.volume;
  if (opts.voiceLabel) body.voice_label = opts.voiceLabel;
  if (opts.instruction) body.instruction = opts.instruction;
  if (opts.sampleRate !== undefined) body.sample_rate = opts.sampleRate;
  if (opts.pronunciationMap && opts.pronunciationMap.length > 0) {
    body.pronunciation_map = { tone: opts.pronunciationMap };
  }
  if (opts.markdownFilter !== undefined) body.markdown_filter = opts.markdownFilter;
  if (opts.streamFormat) body.stream_format = opts.streamFormat;

  if (opts.streamFormat === 'sse') {
    const res = await requestStream(config, {
      url: genUrl(config, '/audio/speech'),
      method: 'POST',
      body,
      headers: { Accept: 'text/event-stream' },
    });
    const parts: Buffer[] = [];
    let completed = false;
    for await (const ev of parseSSE(res)) {
      if (!ev.data) continue;
      if (ev.data === '[DONE]') {
        completed = true;
        continue;
      }
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(ev.data);
      } catch {
        continue;
      }
      const type = j.type as string;
      if (type === 'speech.audio.delta' && typeof j.audio === 'string') {
        const b = Buffer.from(j.audio, 'base64');
        parts.push(b);
        onChunk?.(b);
      } else if (type === 'speech.audio.done') {
        completed = true;
      } else if (type === 'speech.audio.error') {
        const message = typeof j.message === 'string' ? `: ${j.message}` : '';
        throw new CLIError(`TTS stream error${message}.`, ExitCode.GENERAL);
      }
    }
    if (!completed) throw new CLIError('TTS stream ended before completion.', ExitCode.GENERAL);
    return Buffer.concat(parts);
  }

  const buf = await requestBytes(config, { url: genUrl(config, '/audio/speech'), method: 'POST', body });
  onChunk?.(buf);
  return buf;
}

export interface AsrOpts {
  dataB64: string;
  model: string;
  language?: string;
  hotwords?: string[];
  enableItn?: boolean;
  enableTimestamp?: boolean;
  formatType: string;
  rate?: number;
  bits?: number;
  channel?: number;
}

export interface AsrResult {
  text: string;
  usage?: Record<string, unknown>;
}

/** Streaming ASR over SSE. onDelta fires for incremental transcript text. */
export async function transcribe(
  config: Config,
  opts: AsrOpts,
  onDelta?: (s: string) => void,
): Promise<AsrResult> {
  const body: Record<string, unknown> = {
    audio: {
      data: opts.dataB64,
      input: {
        transcription: {
          model: opts.model,
          ...(opts.language ? { language: opts.language } : {}),
          ...(opts.hotwords && opts.hotwords.length ? { hotwords: opts.hotwords } : {}),
          ...(opts.enableItn !== undefined ? { enable_itn: opts.enableItn } : {}),
          ...(opts.enableTimestamp !== undefined ? { enable_timestamp: opts.enableTimestamp } : {}),
        },
        format: {
          type: opts.formatType,
          ...(opts.rate !== undefined ? { rate: opts.rate } : {}),
          ...(opts.bits !== undefined ? { bits: opts.bits } : {}),
          ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
          ...(opts.channel !== undefined && opts.formatType === 'pcm' ? { codec: 'pcm_s16le' } : {}),
        },
      },
    },
  };

  const res = await requestStream(config, {
    url: genUrl(config, '/audio/asr/sse'),
    method: 'POST',
    body,
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
  });

  let text = '';
  let usage: Record<string, unknown> | undefined;
  let completed = false;
  for await (const ev of parseSSE(res)) {
    if (!ev.data) continue;
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const type = j.type as string;
    if (type === 'transcript.text.delta' && typeof j.delta === 'string') {
      text += j.delta;
      onDelta?.(j.delta);
    } else if (type === 'transcript.text.done') {
      completed = true;
      if (typeof j.text === 'string') text = j.text;
      usage = j.usage as Record<string, unknown> | undefined;
    } else if (type === 'error') {
      throw new CLIError(`ASR error: ${(j.message as string) ?? 'unknown'}`, ExitCode.GENERAL);
    }
  }
  if (!completed) throw new CLIError('ASR stream ended before completion.', ExitCode.GENERAL);
  return { text, usage };
}
