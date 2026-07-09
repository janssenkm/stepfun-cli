import fs from 'fs';
import path from 'path';
import { ENDPOINTS } from './client/endpoints';
import { APIError, HttpClient } from './client/http';
import { parseSSE } from './client/sse';

export { APIError } from './client/http';

interface AsrEvent {
  type?: string;
  delta?: string;
  text?: string;
  message?: string;
  [key: string]: unknown;
}

/** Normalized state accumulated from an OpenAI-compatible chat stream. */
export interface ChatStreamResult {
  content: string;
  reasoningContent: string;
  toolCalls: Array<Record<string, any>>;
  finishReason?: string;
  usage?: Record<string, unknown>;
}

/** Extracts visible text from string or content-block response variants. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(block => {
    if (typeof block === 'string') return block;
    if (!block || typeof block !== 'object') return '';
    const item = block as Record<string, unknown>;
    return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
  }).join('');
}

/** Returns only user-visible assistant text from a non-streaming response. */
export function extractAssistantText(response: any): string {
  return contentText(response?.choices?.[0]?.message?.content);
}

export interface TranscriptionResult {
  text: string;
  event: AsrEvent;
}

export class StepFunClient {
  private http: HttpClient;

  constructor(apiKey: string, baseUrl: string = 'https://api.stepfun.ai/step_plan/v1', timeoutSeconds?: number, verbose = false) {
    this.http = new HttpClient(apiKey, baseUrl, (timeoutSeconds ?? 300) * 1000, verbose);
  }

  /** Sends a non-streaming chat completion request and returns the API payload. */
  async chatCompletion(
    model: string,
    messages: any[],
    opts?: {
      temperature?: number; top_p?: number; max_tokens?: number;
      reasoning_effort?: string; reasoning_format?: string;
      stop?: string[]; frequency_penalty?: number;
      response_format?: { type: string }; n?: number;
    }
  ) {
    const body: Record<string, unknown> = { model, messages };
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.top_p !== undefined) body.top_p = opts.top_p;
    if (opts?.max_tokens !== undefined) body.max_tokens = opts.max_tokens;
    if (opts?.reasoning_effort !== undefined) body.reasoning_effort = opts.reasoning_effort;
    if (opts?.reasoning_format !== undefined) body.reasoning_format = opts.reasoning_format;
    if (opts?.stop !== undefined && opts.stop.length > 0) body.stop = opts.stop.length === 1 ? opts.stop[0] : opts.stop;
    if (opts?.frequency_penalty !== undefined) body.frequency_penalty = opts.frequency_penalty;
    if (opts?.response_format !== undefined) body.response_format = opts.response_format;
    if (opts?.n !== undefined) body.n = opts.n;
    return await this.http.requestJson({
      endpoint: ENDPOINTS.chatCompletions,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /**
   * Streams visible text through callbacks while retaining reasoning, tool
   * calls, finish metadata, and usage in the normalized return value.
   */
  async chatCompletionStream(
    model: string,
    messages: any[],
    onDelta: (text: string) => void,
    opts?: {
      temperature?: number; top_p?: number; max_tokens?: number;
      reasoning_effort?: string; reasoning_format?: string;
      stop?: string[]; frequency_penalty?: number;
      response_format?: { type: string }; n?: number;
    },
    onReasoningDelta?: (text: string) => void
  ): Promise<ChatStreamResult> {
    const body: Record<string, unknown> = { model, messages, stream: true };
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.top_p !== undefined) body.top_p = opts.top_p;
    if (opts?.max_tokens !== undefined) body.max_tokens = opts.max_tokens;
    if (opts?.reasoning_effort !== undefined) body.reasoning_effort = opts.reasoning_effort;
    if (opts?.reasoning_format !== undefined) body.reasoning_format = opts.reasoning_format;
    if (opts?.stop !== undefined && opts.stop.length > 0) body.stop = opts.stop.length === 1 ? opts.stop[0] : opts.stop;
    if (opts?.frequency_penalty !== undefined) body.frequency_penalty = opts.frequency_penalty;
    if (opts?.response_format !== undefined) body.response_format = opts.response_format;
    if (opts?.n !== undefined) body.n = opts.n;
    const response = await this.http.request({
      endpoint: ENDPOINTS.chatCompletions,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body)
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new APIError(
        0,
        `Expected SSE stream (Content-Type: text/event-stream) but got "${contentType}". ` +
        `The server may be experiencing issues or the endpoint returned an error page.`
      );
    }

    if (!response.body) throw new Error('API Error: streaming response has no body');

    const result: ChatStreamResult = { content: '', reasoningContent: '', toolCalls: [] };
    for await (const data of parseSSE(response)) {
      if (!data || data === '[DONE]') continue;
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch (err: any) {
        throw new APIError(0, `API Error: invalid SSE JSON: ${err.message}`);
      }
      if (parsed.error) throw new APIError(0, `API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);

      const choice = parsed.choices?.[0];
      const delta = choice?.delta || {};
      const text = contentText(delta.content);
      if (text) {
        result.content += text;
        onDelta(text);
      }
      const reasoning = typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta.reasoning === 'string' ? delta.reasoning : '';
      if (reasoning) {
        result.reasoningContent += reasoning;
        onReasoningDelta?.(reasoning);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const part of delta.tool_calls) {
          const index = Number(part.index ?? 0);
          const target = result.toolCalls[index] ||= { function: { name: '', arguments: '' } };
          if (part.id) target.id = part.id;
          if (part.type) target.type = part.type;
          if (part.function?.name) target.function.name += part.function.name;
          if (part.function?.arguments) target.function.arguments += part.function.arguments;
        }
      }
      if (choice?.finish_reason) result.finishReason = choice.finish_reason;
      if (parsed.usage && typeof parsed.usage === 'object') result.usage = parsed.usage;
    }
    return result;
  }

  /** Synthesizes speech and returns the response audio as a Buffer. */
  async audioSynthesize(
    model: string,
    input: string,
    voice: string = 'cixingnansheng',
    opts?: { response_format?: string; speed?: number; volume?: number; sample_rate?: number }
  ) {
    const body: Record<string, unknown> = { model, input, voice };
    if (opts?.response_format !== undefined) body.response_format = opts.response_format;
    if (opts?.speed !== undefined) body.speed = opts.speed;
    if (opts?.volume !== undefined) body.volume = opts.volume;
    if (opts?.sample_rate !== undefined) body.sample_rate = opts.sample_rate;
    return await this.http.requestBuffer({
      endpoint: ENDPOINTS.audioSpeech,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /** Uploads supported audio as Base64 JSON and resolves the final SSE result. */
  async audioTranscribe(
    model: string,
    filePath: string,
    opts?: { language?: string; hotwords?: string[] }
  ) {
    const format = path.extname(filePath).slice(1).toLowerCase();
    if (!['ogg', 'mp3', 'wav', 'pcm'].includes(format)) {
      throw new Error('Unsupported audio format. Expected one of: ogg, mp3, wav, pcm');
    }

    const formatOptions: Record<string, string | number> = { type: format };
    if (format === 'pcm') {
      // Raw PCM has no container metadata, so the documented defaults must be explicit.
      Object.assign(formatOptions, { codec: 'pcm_s16le', rate: 16000, bits: 16, channel: 1 });
    }

    const transcription: Record<string, unknown> = { model, enable_itn: true };
    if (opts?.language !== undefined) transcription.language = opts.language;
    if (opts?.hotwords !== undefined) transcription.hotwords = opts.hotwords;

    const response = await this.http.request({
      endpoint: ENDPOINTS.audioTranscription,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        audio: {
          data: fs.readFileSync(filePath).toString('base64'),
          input: {
            transcription,
            format: formatOptions
          }
        }
      })
    });

    const events: AsrEvent[] = [];
    for await (const data of parseSSE(response)) {
      if (!data || data === '[DONE]') continue;
      try {
        events.push(JSON.parse(data) as AsrEvent);
      } catch (err: any) {
        throw new APIError(0, `API Error: invalid SSE JSON: ${err.message}`);
      }
    }
    const errorEvent = events.find(event => event.type === 'error');
    if (errorEvent) throw new APIError(0, `API Error: ${errorEvent.message || 'ASR failed'}`);
    const done = [...events].reverse().find(event => event.type === 'transcript.text.done');
    const text = typeof done?.text === 'string'
      ? done.text
      : events.map(event => event.delta || '').join('');
    if (!done && !text) throw new Error('API Error: ASR stream did not contain a transcription result');
    return { text, event: done || events[events.length - 1] } as TranscriptionResult;
  }

  /** Sends a multipart image-edit request and returns the API JSON payload. */
  async imageEdit(
    model: string,
    imagePath: string,
    prompt: string,
    responseFormat: string = 'b64_json',
    opts?: { seed?: number; steps?: number; cfg_scale?: number; negative_prompt?: string }
  ) {
    const form = new FormData();
    form.append('image', new Blob([fs.readFileSync(imagePath)]), path.basename(imagePath));
    form.append('prompt', prompt);
    form.append('model', model);
    form.append('response_format', responseFormat);
    if (opts?.seed !== undefined) form.append('seed', String(opts.seed));
    if (opts?.steps !== undefined) form.append('steps', String(opts.steps));
    if (opts?.cfg_scale !== undefined) form.append('cfg_scale', String(opts.cfg_scale));
    if (opts?.negative_prompt !== undefined) form.append('negative_prompt', opts.negative_prompt);

    return await this.http.requestJson({
      endpoint: ENDPOINTS.imageEdits,
      method: 'POST',
      body: form
    });
  }
}
