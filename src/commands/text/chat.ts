import { defineCommand } from '../../command';
import { buildConversation } from '../../utils/messages';
import { createCompletion, streamCompletion, type CompletionResult } from '../../api/chat';
import { dryRun } from '../../output/formatter';
import { parseTools, formatUsageLine, dim } from './_shared';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { numberRange, oneOf } from '../../utils/validation';

export default defineCommand({
  name: 'text chat',
  description: 'Chat via the OpenAI-compatible Completions API (POST /chat/completions)',
  usage: 'stepfun text chat --model <model> (--message <text> | --messages-file <path>) [flags]',
  options: [
    { flag: '--model <model>', description: 'Model id (default: step-3.7-flash)' },
    { flag: '--message <text>', description: 'Message (repeatable; optional "role:" prefix)', type: 'array' },
    { flag: '--messages-file <path>', description: 'JSON messages file (- for stdin)' },
    { flag: '--system <text>', description: 'System prompt' },
    { flag: '--image <path|url>', description: 'Image attachment (repeatable)', type: 'array' },
    { flag: '--video <url>', description: 'Video URL attachment (repeatable)', type: 'array' },
    { flag: '--audio <path|url>', description: 'Audio attachment (repeatable)', type: 'array' },
    { flag: '--max-tokens <n>', description: 'Max output tokens', type: 'number' },
    { flag: '--temperature <n>', description: '0.0–2.0', type: 'number' },
    { flag: '--top-p <n>', description: 'Nucleus sampling', type: 'number' },
    { flag: '--n <n>', description: 'Number of choices', type: 'number' },
    { flag: '--stop <seq>', description: 'Stop sequence(s)' },
    { flag: '--frequency-penalty <n>', description: '0.0–1.0', type: 'number' },
    { flag: '--response-format <fmt>', description: 'text | json_object' },
    { flag: '--reasoning-effort <lvl>', description: 'low | medium | high' },
    { flag: '--reasoning-format <fmt>', description: 'general | deepseek-style' },
    { flag: '--tool <json|path>', description: 'Function tool (repeatable)', type: 'array' },
    { flag: '--stream', description: 'Stream tokens as they arrive' },
    { flag: '--show-reasoning', description: 'Print reasoning content to stderr' },
  ],
  examples: [
    'stepfun text chat --model step-3.7-flash --message "Hello" --stream',
    'stepfun text chat --model step-3.7-flash --message "Solve: (80+20)/5" --reasoning-effort high',
  ],
  apiDocs: '/docs/en/api-reference/chat/chat-completion-create',
  async run(config, flags) {
    const model = (flags.model as string | undefined) || config.defaultTextModel;
    if (!model) throw new CLIError('--model is required.', ExitCode.USAGE);
    numberRange('--max-tokens', flags.maxTokens as number | undefined, 1, Number.MAX_SAFE_INTEGER, true);
    numberRange('--temperature', flags.temperature as number | undefined, 0, 2);
    numberRange('--top-p', flags.topP as number | undefined, 0, 1);
    numberRange('--n', flags.n as number | undefined, 1, Number.MAX_SAFE_INTEGER, true);
    numberRange('--frequency-penalty', flags.frequencyPenalty as number | undefined, 0, 1);
    if (flags.responseFormat) oneOf('--response-format', flags.responseFormat as string, ['text', 'json_object']);
    if (flags.reasoningEffort) oneOf('--reasoning-effort', flags.reasoningEffort as string, ['low', 'medium', 'high']);
    if (flags.reasoningFormat) oneOf('--reasoning-format', flags.reasoningFormat as string, ['general', 'deepseek-style']);

    const { system, messages } = await buildConversation(flags);
    const body: Record<string, unknown> = {
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    };
    const set = (key: string, flag: string, type: 'num' | 'str' = 'str') => {
      const v = flags[flag];
      if (v === undefined) return;
      body[key] = type === 'num' ? Number(v) : v;
    };
    set('max_tokens', 'maxTokens', 'num');
    set('temperature', 'temperature', 'num');
    set('top_p', 'topP', 'num');
    set('n', 'n', 'num');
    set('frequency_penalty', 'frequencyPenalty', 'num');
    if (flags.stop !== undefined) body.stop = flags.stop;
    if (flags.responseFormat) body.response_format = { type: flags.responseFormat };
    if (flags.reasoningEffort) body.reasoning_effort = flags.reasoningEffort;
    if (flags.reasoningFormat) body.reasoning_format = flags.reasoningFormat;
    const tools = parseTools(flags.tool as string[] | undefined);
    if (tools.length > 0) body.tools = tools;

    if (dryRun(config, { method: 'POST', path: '/chat/completions', body })) return;

    const showReasoning = !!flags.showReasoning;
    const stream = !!flags.stream;

    if (stream && config.output === 'text') {
      const result = await streamCompletion(config, body, {
        onContent: (d) => process.stdout.write(d),
        onReasoning: showReasoning ? (d) => process.stderr.write(dim(d)) : undefined,
      });
      await finalizeText(result, { showReasoning, streamed: true });
      return;
    }

    const result: CompletionResult = stream
      ? await streamCompletion(config, body)
      : await createCompletion(config, body);

    if (config.output === 'json') {
      process.stdout.write(JSON.stringify(result.raw ?? result, null, 2) + '\n');
      return;
    }
    await finalizeText(result, { showReasoning, streamed: false });
  },
});

async function finalizeText(
  result: CompletionResult,
  opts: { showReasoning: boolean; streamed: boolean },
): Promise<void> {
  if (!opts.streamed) {
    if (result.content) {
      process.stdout.write(result.content + (result.content.endsWith('\n') ? '' : '\n'));
    }
    if (opts.showReasoning && result.reasoning) {
      process.stderr.write(dim('\n[reasoning]\n' + result.reasoning + '\n'));
    }
  } else {
    // Content/reasoning were already streamed live; just terminate the line.
    process.stdout.write('\n');
    if (opts.showReasoning && result.reasoning) process.stderr.write('\n');
  }
  if (result.toolCalls.length > 0) {
    process.stdout.write('\n' + JSON.stringify(result.toolCalls, null, 2) + '\n');
  }
  const usage = formatUsageLine(result.usage);
  if (usage) process.stderr.write(dim(usage + '\n'));
}
