import { Command, OptionValues } from 'commander';

interface UnsupportedCommandContext {
  program: Command;
  UnsupportedError: new (message: string, hint?: string) => Error;
  emitError: (error: unknown, output: string) => number;
  resolveOutput: (options: OptionValues) => string;
}

interface UnsupportedSpec {
  parent: Command;
  name: string;
  description: string;
  options?: Array<[string, string]>;
}

/** Registers documented commands whose StepFun API capability is unavailable. */
export function registerUnsupportedCommands(context: UnsupportedCommandContext): void {
  const { program } = context;
  const auth = findCommand(program, 'auth');
  const text = findCommand(program, 'text');
  const speech = findCommand(program, 'speech');
  const image = findCommand(program, 'image');

  unsupported(context, { parent: auth, name: 'refresh', description: 'Refresh OAuth credentials (unsupported)' });
  unsupported(context, { parent: text, name: 'repl', description: 'Start an interactive multi-turn chat (unsupported)', options: [
    ['--model <model>', 'Model name'], ['--system <text>', 'System message'],
    ['--max-tokens <int>', 'Maximum tokens'], ['--temperature <number>', 'Sampling temperature'],
    ['--top-p <number>', 'Nucleus sampling probability']
  ] });
  unsupported(context, { parent: speech, name: 'voices', description: 'List available system voices (unsupported)', options: [
    ['--language <code>', 'Filter by language']
  ] });
  unsupported(context, { parent: image, name: 'generate', description: 'Generate images (unsupported)', options: [
    ['--prompt <text>', 'Generation prompt'], ['--model <model>', 'Model name'],
    ['--aspect-ratio <ratio>', 'Image aspect ratio'], ['--n <count>', 'Number of images'],
    ['--seed <int>', 'Random seed'], ['--width <pixels>', 'Image width'], ['--height <pixels>', 'Image height'],
    ['--prompt-optimizer', 'Enable prompt optimization'], ['--aigc-watermark', 'Enable AIGC watermark'],
    ['--subject-ref <path>', 'Subject reference image'], ['--out <path>', 'Single output file'],
    ['--response-format <format>', 'API response representation'], ['--out-dir <directory>', 'Multiple output directory'],
    ['--out-prefix <prefix>', 'Multiple output filename prefix']
  ] });

  const video = program.command('video').description('Video generation (unsupported)');
  unsupported(context, { parent: video, name: 'generate', description: 'Generate a video (unsupported)', options: [
    ['--model <model>', 'Model name'], ['--prompt <text>', 'Generation prompt'],
    ['--first-frame <image>', 'First frame image'], ['--last-frame <image>', 'Last frame image'],
    ['--subject-image <image>', 'Subject reference image'], ['--callback-url <url>', 'Completion callback URL'],
    ['--download', 'Download the completed artifact'], ['--no-wait', 'Do not wait for completion'],
    ['--async', 'Return after task creation'], ['--poll-interval <seconds>', 'Task polling interval']
  ] });
  const videoTask = video.command('task').description('Video tasks (unsupported)');
  unsupported(context, { parent: videoTask, name: 'get', description: 'Get video task status (unsupported)', options: [
    ['--task-id <id>', 'Video task ID']
  ] });
  unsupported(context, { parent: video, name: 'download', description: 'Download a completed video (unsupported)', options: [
    ['--file-id <id>', 'Completed file ID'], ['--out <path>', 'Output file path']
  ] });

  const music = program.command('music').description('Music generation (unsupported)');
  unsupported(context, { parent: music, name: 'generate', description: 'Generate music (unsupported)', options: [
    ['--model <model>', 'Model name'], ['--prompt <text>', 'Music prompt'], ['--lyrics <text>', 'Song lyrics'],
    ['--format <format>', 'Audio encoding'], ['--output-format <format>', 'API output transport'],
    ['--stream', 'Stream audio'], ['--out <path>', 'Output file path']
  ] });
  unsupported(context, { parent: music, name: 'cover', description: 'Generate a music cover (unsupported)', options: [
    ['--prompt <text>', 'Cover prompt'], ['--audio <url>', 'Reference audio URL'],
    ['--audio-file <path>', 'Reference audio file'], ['--format <format>', 'Audio encoding'],
    ['--sample-rate <number>', 'Sample rate'], ['--bitrate <number>', 'Bitrate'],
    ['--channel <number>', 'Channel count'], ['--stream', 'Stream audio'], ['--out <path>', 'Output file path']
  ] });

  const search = program.command('search').description('Web search (unsupported)');
  const query = unsupported(context, { parent: search, name: 'query', description: 'Search the web (unsupported)', options: [
    ['--q <query>', 'Search query']
  ] });
  query.alias('web');

  const vision = program.command('vision').description('Image understanding (unsupported)');
  unsupported(context, { parent: vision, name: 'describe', description: 'Describe an image (unsupported)', options: [
    ['--image <path-or-url>', 'Image path or URL'], ['--file-id <id>', 'Uploaded file ID'],
    ['--prompt <text>', 'Description instruction']
  ] });

  const quota = program.command('quota').description('Usage quota (unsupported)');
  unsupported(context, { parent: quota, name: 'show', description: 'Show usage quota (unsupported)' });
}

function findCommand(program: Command, name: string): Command {
  const command = program.commands.find(candidate => candidate.name() === name);
  if (!command) throw new Error(`Command group is not registered: ${name}`);
  return command;
}

function unsupported(context: UnsupportedCommandContext, spec: UnsupportedSpec): Command {
  const command = spec.parent.command(spec.name).description(spec.description);
  for (const [flags, description] of spec.options ?? []) command.option(flags, description);
  command.action(() => {
    const global = context.program.opts();
    const path = commandPath(command);
    process.exitCode = context.emitError(
      new context.UnsupportedError(
        `stepfun ${path} is not supported by the current StepFun API integration.`,
        'Use `stepfun models list` and the supported Resource commands shown in `stepfun --help`.'
      ),
      context.resolveOutput(global)
    );
  });
  return command;
}

function commandPath(command: Command): string {
  const names: string[] = [];
  let current: Command | null = command;
  while (current?.parent) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(' ');
}
