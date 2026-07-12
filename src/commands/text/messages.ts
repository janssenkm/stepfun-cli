import { defineCommand } from '../../command';
import { buildConversation } from '../../utils/messages';
import { createMessages, streamMessages, type MessagesResult } from '../../api/chat';
import { dryRun } from '../../output/formatter';
import { parseTools, formatUsageLine, dim } from './_shared';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'text messages',
  description: 'Chat via the Anthropic-compatible Messages API (POST /messages)',
  usage: 'stepfun text messages --model <model> --message <text> [--max-tokens <n>] [flags]',
  options: [
    { flag: '--model <model>', description: 'Model id (default: step-3.7-flash)' },
    { flag: '--message <text>', description: 'Message (repeatable; optional "role:" prefix)', type: 'array' },
    { flag: '--messages-file <path>', description: 'JSON messages file (- for stdin)' },
    { flag: '--system <text>', description: 'System prompt' },
    { flag: '--max-tokens <n>', description: 'Max output tokens (required by API; default 1024)', type: 'number' },
    { flag: '--temperature <n>', description: '0.0–2.0', type: 'number' },
    { flag: '--top-p <n>', description: 'Nucleus sampling', type: 'number' },
    { flag: '--top-k <n>', description: 'Top-k sampling', type: 'number' },
    { flag: '--stop-sequence <seq>', description: 'Stop sequence (repeatable)', type: 'array' },
    { flag: '--effort <lvl>', description: 'low | medium | high → output_config.effort' },
    { flag: '--tool <json|path>', description: 'Anthropic tool definition (repeatable)', type: 'array' },
    { flag: '--stream', description: 'Stream tokens as they arrive' },
    { flag: '--show-reasoning', description: 'Print reasoning to stderr (if returned)' },
  ],
  examples: ['stepfun text messages --model step-3.5-flash --message "Hi" --max-tokens 256'],
  apiDocs: '/docs/en/api-reference/chat/messages-create',
  async run(config, flags) {
    const model = (flags.model as string | undefined) || config.defaultTextModel || 'step-3.7-flash';
    const maxTokens = (flags.maxTokens as number | undefined) ?? 1024;
    if (!maxTokens || maxTokens <= 0) throw new CLIError('--max-tokens must be > 0.', ExitCode.USAGE);

    const { system, messages } = await buildConversation(flags);
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
    if (system) body.system = system;
    if (flags.temperature !== undefined) body.temperature = Number(flags.temperature);
    if (flags.topP !== undefined) body.top_p = Number(flags.topP);
    if (flags.topK !== undefined) body.top_k = Number(flags.topK);
    if (flags.stopSequence) body.stop_sequences = flags.stopSequence;
    if (flags.effort) body.output_config = { effort: flags.effort };
    const tools = parseTools(flags.tool as string[] | undefined);
    if (tools.length > 0) body.tools = tools;

    if (dryRun(config, { method: 'POST', path: '/messages', body })) return;

    const stream = !!flags.stream;
    if (stream && config.output === 'text') {
      const result = await streamMessages(config, body, { onContent: (d) => process.stdout.write(d) });
      process.stdout.write('\n');
      if (result.toolCalls.length) process.stdout.write('\n' + JSON.stringify(result.toolCalls, null, 2) + '\n');
      const u = formatUsageLine(result.usage);
      if (u) process.stderr.write(dim(u + '\n'));
      return;
    }

    const result: MessagesResult = stream
      ? await streamMessages(config, body)
      : await createMessages(config, body);

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
