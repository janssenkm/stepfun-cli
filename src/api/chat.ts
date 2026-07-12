import { request, requestJson, requestStream } from '../client/http';
import { parseSSE } from '../client/sse';
import { genUrl } from '../client/urls';
import type { Config } from '../config/schema';

export interface StreamHandlers {
  onContent?(delta: string): void;
  onReasoning?(delta: string): void;
  onToolCall?(tc: { index: number; id?: string; name?: string; argumentsDelta?: string }): void;
}

export interface CompletionResult {
  content: string;
  reasoning: string;
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  usage?: Record<string, unknown>;
  finishReason?: string;
  raw?: unknown;
}

function mergeToolCallDelta(
  acc: CompletionResult['toolCalls'],
  tc: { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } },
): void {
  const idx = tc.index ?? 0;
  if (!acc[idx]) acc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
  if (tc.id) acc[idx]!.id = tc.id;
  if (tc.type) acc[idx]!.type = tc.type;
  if (tc.function?.name) acc[idx]!.function.name = tc.function.name;
  if (tc.function?.arguments) acc[idx]!.function.arguments += tc.function.arguments;
}

// ---------------- Chat Completions ----------------

export async function createCompletion(config: Config, body: Record<string, unknown>): Promise<CompletionResult> {
  const data = await requestJson<Record<string, unknown>>(config, {
    url: genUrl(config, '/chat/completions'),
    method: 'POST',
    body,
  });
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const msg = choice?.message as Record<string, unknown> | undefined;
  return {
    content: String(msg?.content ?? ''),
    reasoning: String(msg?.reasoning ?? ''),
    toolCalls: (msg?.tool_calls as CompletionResult['toolCalls']) ?? [],
    usage: data.usage as Record<string, unknown> | undefined,
    finishReason: choice?.finish_reason as string | undefined,
    raw: data,
  };
}

export async function streamCompletion(
  config: Config,
  body: Record<string, unknown>,
  h: StreamHandlers = {},
): Promise<CompletionResult> {
  const res = await requestStream(config, {
    url: genUrl(config, '/chat/completions'),
    method: 'POST',
    body: { ...body, stream: true },
    headers: { Accept: 'text/event-stream' },
  });

  const result: CompletionResult = { content: '', reasoning: '', toolCalls: [] };
  for await (const ev of parseSSE(res)) {
    if (!ev.data || ev.data === '[DONE]') {
      if (ev.data === '[DONE]') break;
      continue;
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
    if (choice) {
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (delta?.content) {
        result.content += delta.content;
        h.onContent?.(delta.content as string);
      }
      if (delta?.reasoning) {
        result.reasoning += delta.reasoning;
        h.onReasoning?.(delta.reasoning as string);
      }
      const tcs = delta?.tool_calls;
      if (Array.isArray(tcs)) {
        for (const tc of tcs as Array<Record<string, unknown>>) {
          mergeToolCallDelta(result.toolCalls, tc as Parameters<typeof mergeToolCallDelta>[1]);
          h.onToolCall?.({
            index: (tc.index as number) ?? 0,
            id: tc.id as string | undefined,
            name: (tc.function as { name?: string })?.name,
            argumentsDelta: (tc.function as { arguments?: string })?.arguments,
          });
        }
      }
      if (choice.finish_reason) result.finishReason = choice.finish_reason as string;
    }
    if (json.usage) result.usage = json.usage as Record<string, unknown>;
  }
  return result;
}

// ---------------- Messages (Anthropic-compatible) ----------------

export interface MessagesResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stopReason?: string;
  raw?: unknown;
}

export async function createMessages(config: Config, body: Record<string, unknown>): Promise<MessagesResult> {
  const data = await requestJson<Record<string, unknown>>(config, {
    url: genUrl(config, '/messages'),
    method: 'POST',
    body,
  });
  const blocks = (data.content as Array<Record<string, unknown>>) ?? [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('');
  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: String(b.id), name: String(b.name), input: b.input }));
  return {
    content: text,
    toolCalls,
    usage: data.usage as MessagesResult['usage'],
    stopReason: data.stop_reason as string | undefined,
    raw: data,
  };
}

export async function streamMessages(
  config: Config,
  body: Record<string, unknown>,
  h: StreamHandlers = {},
): Promise<MessagesResult> {
  const res = await requestStream(config, {
    url: genUrl(config, '/messages'),
    method: 'POST',
    body: { ...body, stream: true },
    headers: { Accept: 'text/event-stream' },
  });

  let content = '';
  let usage: MessagesResult['usage'];
  let stopReason: string | undefined;

  for await (const ev of parseSSE(res)) {
    if (!ev.data) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const type = (json.type as string) || ev.event;
    if (type === 'content_block_delta') {
      const delta = json.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        content += delta.text;
        h.onContent?.(delta.text);
      }
    } else if (type === 'message_start') {
      usage = (json.message as { usage?: MessagesResult['usage'] })?.usage;
    } else if (type === 'message_delta') {
      stopReason = (json.stop_reason as string) ?? stopReason;
      usage = { ...usage, ...(json.usage as MessagesResult['usage']) };
    } else if (type === 'message_stop') {
      break;
    }
  }
  return { content, toolCalls: [], usage, stopReason };
}

// ---------------- Responses (OpenAI-compatible) ----------------

export interface ResponsesResult {
  content: string;
  reasoning: string;
  status?: string;
  usage?: Record<string, unknown>;
  raw?: unknown;
}

function extractResponsesText(output: unknown): string {
  if (!Array.isArray(output)) return '';
  return (output as Array<Record<string, unknown>>)
    .filter((o) => o.type === 'message')
    .flatMap((o) => (o.content as Array<Record<string, unknown>>) ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => String(c.text))
    .join('');
}

export async function createResponses(config: Config, body: Record<string, unknown>): Promise<ResponsesResult> {
  const data = await requestJson<Record<string, unknown>>(config, {
    url: genUrl(config, '/responses'),
    method: 'POST',
    body,
  });
  return {
    content: extractResponsesText(data.output),
    reasoning: '',
    status: data.status as string | undefined,
    usage: data.usage as Record<string, unknown> | undefined,
    raw: data,
  };
}

export async function streamResponses(
  config: Config,
  body: Record<string, unknown>,
  h: StreamHandlers = {},
): Promise<ResponsesResult> {
  const res = await requestStream(config, {
    url: genUrl(config, '/responses'),
    method: 'POST',
    body: { ...body, stream: true },
    headers: { Accept: 'text/event-stream' },
  });

  let content = '';
  let reasoning = '';
  let usage: Record<string, unknown> | undefined;
  let status: string | undefined;

  for await (const ev of parseSSE(res)) {
    if (!ev.data) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const type = (json.type as string) || ev.event;
    if (type === 'response.output_text.delta' && typeof json.delta === 'string') {
      content += json.delta;
      h.onContent?.(json.delta);
    } else if (type === 'response.reasoning_text.delta' && typeof json.delta === 'string') {
      reasoning += json.delta;
      h.onReasoning?.(json.delta);
    } else if (type === 'response.completed') {
      const resp = json.response as Record<string, unknown> | undefined;
      status = resp?.status as string | undefined;
      usage = resp?.usage as Record<string, unknown> | undefined;
    } else if (type === 'response.failed' || type === 'error') {
      const msg = (json.error as { message?: string })?.message || JSON.stringify(json);
      // Defer throwing until after the stream closes; surface as error via throw.
      throw new Error(`Responses stream failed: ${msg}`);
    }
  }
  return { content, reasoning, status, usage };
}

// Re-export for command convenience.
export { request };
