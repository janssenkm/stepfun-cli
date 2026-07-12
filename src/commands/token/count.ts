import { defineCommand } from '../../command';
import { countTokens } from '../../api/token';
import { buildConversation } from '../../utils/messages';
import { formatOutput, dryRun } from '../../output/formatter';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'token count',
  description: 'Count tokens for a conversation (Chat-Completion-style input)',
  usage: 'stepfun token count --model <model> (--message <text> | --messages-file <path>)',
  options: [
    { flag: '--model <model>', description: 'Model name' },
    { flag: '--message <text>', description: 'Message (repeatable; optional "role:" prefix)', type: 'array' },
    { flag: '--messages-file <path>', description: 'JSON messages file (- for stdin)' },
    { flag: '--system <text>', description: 'System prompt' },
    { flag: '--image <path|url>', description: 'Image attachment (repeatable)', type: 'array' },
  ],
  examples: ['stepfun token count --model step-3.7-flash --message "hello"'],
  apiDocs: '/docs/en/api-reference/token-count',
  async run(config, flags) {
    const model = (flags.model as string | undefined) || config.defaultTextModel;
    if (!model) throw new CLIError('--model is required.', ExitCode.USAGE);

    const { system, messages } = await buildConversation(flags);
    const body = {
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    };

    if (dryRun(config, { method: 'POST', path: '/token/count', body })) return;

    const { data } = await countTokens(config, body);
    if (config.output === 'json') {
      process.stdout.write(formatOutput({ model, total_tokens: data.total_tokens }, 'json') + '\n');
      return;
    }
    process.stdout.write(`${data.total_tokens} tokens\n`);
  },
});
