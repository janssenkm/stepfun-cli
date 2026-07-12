import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { defineCommand } from '../../command';
import { buildConversation } from '../../utils/messages';
import { createResponses, streamResponses, type ResponsesResult } from '../../api/chat';
import { dryRun } from '../../output/formatter';
import { parseTools, formatUsageLine, dim } from './_shared';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { mutuallyExclusive, numberRange, oneOf } from '../../utils/validation';

function loadJsonSchema(ref: string): { name: string; schema: unknown } {
  if (!existsSync(ref)) throw new CLIError(`--json-schema file not found: ${ref}`, ExitCode.USAGE);
  let schema: unknown;
  try {
    schema = JSON.parse(readFileSync(ref, 'utf-8'));
  } catch {
    throw new CLIError(`--json-schema is not valid JSON: ${ref}`, ExitCode.USAGE);
  }
  return { name: basename(ref).replace(/\.[^.]+$/, '') || 'schema', schema };
}

export default defineCommand({
  name: 'text responses',
  description: 'Chat via the OpenAI-compatible Responses API (POST /responses)',
  usage: 'stepfun text responses (--input <text> | --message <text>) [flags]',
  options: [
    { flag: '--model <model>', description: 'Model id (default: step-3.7-flash)' },
    { flag: '--input <text>', description: 'Plain-text input (single user turn)' },
    { flag: '--message <text>', description: 'Message (repeatable; optional "role:" prefix)', type: 'array' },
    { flag: '--messages-file <path>', description: 'JSON messages file (- for stdin)' },
    { flag: '--instructions <text>', description: 'Top-level system instructions' },
    { flag: '--effort <lvl>', description: 'low | medium | high → reasoning.effort' },
    { flag: '--max-output-tokens <n>', description: 'Max output tokens', type: 'number' },
    { flag: '--temperature <n>', description: '0.0–2.0', type: 'number' },
    { flag: '--top-p <n>', description: 'Nucleus sampling', type: 'number' },
    { flag: '--tool <json|path>', description: 'Function tool (repeatable)', type: 'array' },
    { flag: '--tool-choice <str>', description: 'Tool-choice strategy (only "auto")' },
    { flag: '--json-schema <path>', description: 'JSON Schema file → structured output' },
    { flag: '--stream', description: 'Stream tokens as they arrive' },
    { flag: '--show-reasoning', description: 'Print reasoning to stderr' },
  ],
  examples: [
    'stepfun text responses --input "Write a haiku about spring." --effort high --stream',
  ],
  apiDocs: '/docs/en/api-reference/responses/responses-create',
  async run(config, flags) {
    const model = (flags.model as string | undefined) || config.defaultTextModel || 'step-3.7-flash';
    const showReasoning = !!flags.showReasoning;
    mutuallyExclusive('--input', flags.input, '--message/--messages-file', flags.message ?? flags.messagesFile);
    numberRange('--max-output-tokens', flags.maxOutputTokens as number | undefined, 1, Number.MAX_SAFE_INTEGER, true);
    numberRange('--temperature', flags.temperature as number | undefined, 0, 2);
    numberRange('--top-p', flags.topP as number | undefined, 0, 1);
    if (flags.effort) oneOf('--effort', flags.effort as string, ['low', 'medium', 'high']);
    if (flags.toolChoice) oneOf('--tool-choice', flags.toolChoice as string, ['auto']);

    let input: unknown;
    if (flags.input) {
      input = flags.input as string;
    } else {
      const { system, messages } = await buildConversation(flags);
      input = messages;
      if (system && !flags.instructions) flags.instructions = system;
    }

    const body: Record<string, unknown> = { model, input };
    if (flags.instructions) body.instructions = flags.instructions;
    if (flags.effort) body.reasoning = { effort: flags.effort };
    if (flags.maxOutputTokens !== undefined) body.max_output_tokens = Number(flags.maxOutputTokens);
    if (flags.temperature !== undefined) body.temperature = Number(flags.temperature);
    if (flags.topP !== undefined) body.top_p = Number(flags.topP);
    if (flags.toolChoice) body.tool_choice = flags.toolChoice;
    const tools = parseTools(flags.tool as string[] | undefined);
    if (tools.length > 0) body.tools = tools;
    if (flags.jsonSchema) {
      const { name, schema } = loadJsonSchema(flags.jsonSchema as string);
      body.text = { format: { type: 'json_schema', name, strict: true, schema } };
    }

    if (dryRun(config, { method: 'POST', path: '/responses', body })) return;

    const stream = !!flags.stream;
    if (stream && config.output === 'text') {
      const result = await streamResponses(config, body, {
        onContent: (d) => process.stdout.write(d),
        onReasoning: showReasoning ? (d) => process.stderr.write(dim(d)) : undefined,
      });
      process.stdout.write('\n');
      if (result.toolCalls.length) process.stdout.write('\n' + JSON.stringify(result.toolCalls, null, 2) + '\n');
      if (showReasoning && result.reasoning) process.stderr.write(dim('\n[reasoning]\n' + result.reasoning + '\n'));
      const u = formatUsageLine(result.usage);
      if (u) process.stderr.write(dim(u + '\n'));
      return;
    }

    const result: ResponsesResult = stream
      ? await streamResponses(config, body)
      : await createResponses(config, body);

    if (config.output === 'json') {
      process.stdout.write(JSON.stringify(result.raw ?? result, null, 2) + '\n');
      return;
    }
    if (result.content) process.stdout.write(result.content + '\n');
    if (result.toolCalls.length) process.stdout.write('\n' + JSON.stringify(result.toolCalls, null, 2) + '\n');
    const u = formatUsageLine(result.usage);
    if (u) process.stderr.write(dim(u + '\n'));
  },
});
