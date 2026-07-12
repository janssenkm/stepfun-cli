import type { Command } from './command';
import { CLIError } from './errors/base';
import { ExitCode } from './errors/codes';
import { REGIONS, type Region } from './config/regions';

import authLogin from './commands/auth/login';
import authStatus from './commands/auth/status';
import authLogout from './commands/auth/logout';
import configShow from './commands/config/show';
import configSet from './commands/config/set';
import modelsList from './commands/models/list';
import modelsGet from './commands/models/get';
import accountShow from './commands/account/show';
import fileUpload from './commands/file/upload';
import fileList from './commands/file/list';
import fileGet from './commands/file/get';
import fileContent from './commands/file/content';
import fileDelete from './commands/file/delete';
import tokenCount from './commands/token/count';
import textChat from './commands/text/chat';
import textMessages from './commands/text/messages';
import textResponses from './commands/text/responses';
import imageGenerate from './commands/image/generate';
import imageEdit from './commands/image/edit';
import speechSynthesize from './commands/speech/synthesize';
import speechRecognize from './commands/speech/recognize';

export type { Command, OptionDef } from './command';

interface CommandNode {
  command?: Command;
  children: Map<string, CommandNode>;
}

class CommandRegistry {
  private root: CommandNode = { children: new Map() };

  constructor(commands: Record<string, Command>) {
    for (const [path, cmd] of Object.entries(commands)) this.register(path, cmd);
  }

  private register(path: string, command: Command): void {
    const parts = path.split(' ');
    let node = this.root;
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map() });
      node = node.children.get(part)!;
    }
    node.command = command;
  }

  getAllCommands(): Command[] {
    const commands: Command[] = [];
    const traverse = (node: CommandNode) => {
      if (node.command) commands.push(node.command);
      for (const child of node.children.values()) traverse(child);
    };
    traverse(this.root);
    return commands;
  }

  resolve(commandPath: string[]): { command: Command; extra: string[] } {
    let node = this.root;
    const matched: string[] = [];

    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) break;
      node = child;
      matched.push(part);
    }

    if (node.command) {
      return { command: node.command, extra: commandPath.slice(matched.length) };
    }

    if (matched.length > 0 && node.children.size === 1) {
      const [, child] = node.children.entries().next().value as [string, CommandNode];
      if (child.command) return { command: child.command, extra: commandPath.slice(matched.length) };
    }

    if (matched.length > 0 && node.children.size > 0) {
      const subcommands = Array.from(node.children.entries())
        .map(([name, n]) =>
          n.command
            ? `  stepfun ${matched.join(' ')} ${name.padEnd(10)} ${n.command.description}`
            : `  stepfun ${matched.join(' ')} ${name} [...]`,
        )
        .join('\n');
      throw new CLIError(
        `Unknown command: stepfun ${commandPath.join(' ')}\n\nAvailable:\n${subcommands}`,
        ExitCode.USAGE,
        'stepfun --help',
      );
    }

    throw new CLIError(`Unknown command: stepfun ${commandPath.join(' ')}`, ExitCode.USAGE, 'stepfun --help');
  }

  has(prefix: string[]): boolean {
    let node = this.root;
    for (const part of prefix) {
      const child = node.children.get(part);
      if (!child) return false;
      node = child;
    }
    return true;
  }

  // ---- help rendering ----
  private bold = (s: string, out: NodeJS.WriteStream) => (out.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
  private accent = (s: string, out: NodeJS.WriteStream) =>
    out.isTTY ? `\x1b[38;2;37;99;235m${s}\x1b[0m` : s;
  private dim = (s: string, out: NodeJS.WriteStream) => (out.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

  printHelp(commandPath: string[], out: NodeJS.WriteStream = process.stdout, region: Region = 'StepPlan-Global'): void {
    if (commandPath.length === 0) {
      this.printRootHelp(out);
      return;
    }
    let node = this.root;
    for (const part of commandPath) {
      const child = node.children.get(part);
      if (!child) {
        this.printRootHelp(out);
        return;
      }
      node = child;
    }
    if (node.command) {
      this.printCommandHelp(node.command, out, region);
      return;
    }
    const prefix = commandPath.join(' ');
    out.write(`\n${this.bold('Usage:', out)} stepfun ${prefix} <command> [flags]\n\n`);
    out.write(`${this.bold('Commands:', out)}\n`);
    this.printChildren(node, prefix, out);
    out.write('\n');
  }

  private printRootHelp(out: NodeJS.WriteStream): void {
    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`
${b('stepfun')} — StepFun StepPlan CLI

${b('Usage:')} stepfun <resource> <command> [flags]

${b('Resources:')}
  ${a('text')}      Text generation (chat, messages, responses)
  ${a('image')}     Image generation and editing (generate, edit)
  ${a('speech')}    Speech synthesis and recognition (synthesize, recognize)
  ${a('models')}    Model catalog (list, get)
  ${a('file')}      File storage (upload, list, get, content, delete)
  ${a('account')}   Account details (show)
  ${a('token')}     Token counting (count)
  ${a('auth')}      Authentication (login, status, logout)
  ${a('config')}    CLI configuration (show, set)

${b('Global Flags:')}
  ${a('--api-key <key>')}        StepFun API key (overrides config)
  ${a('--region <region>')}      StepPlan-Global (default) | StepPlan-CN
  ${a('--base-url <url>')}       Override generation (StepPlan) base URL
  ${a('--api-base-url <url>')}   Override management (/v1) base URL
  ${a('--output <format>')}      text | json (auto: json when piped)
  ${a('--timeout <seconds>')}    Request timeout
  ${a('--quiet')}                Suppress non-essential output
  ${a('--verbose')}              Print HTTP request/response details
  ${a('--dry-run')}              Print the request body without calling the API
  ${a('--non-interactive')}      Disable prompts (CI/agent mode)
  ${a('--help')} / ${a('--version')}

${b('Getting started:')}
  ${d('1.')} stepfun auth login --api-key sk-... --region StepPlan-Global
  ${d('2.')} stepfun text chat --model step-3.7-flash --message "Hello" --stream

${b('Getting help:')}
  ${d('Add --help after any command, e.g.')} stepfun text chat --help
`);
  }

  private printCommandHelp(cmd: Command, out: NodeJS.WriteStream, region: Region): void {
    const b = (s: string) => this.bold(s, out);
    const a = (s: string) => this.accent(s, out);
    const d = (s: string) => this.dim(s, out);

    out.write(`\n${cmd.description}\n`);
    if (cmd.usage) out.write(`${b('Usage:')} ${cmd.usage}\n`);
    if (cmd.options && cmd.options.length > 0) {
      const maxLen = Math.max(...cmd.options.map((o) => o.flag.length));
      out.write(`\n${b('Options:')}\n`);
      for (const opt of cmd.options) {
        out.write(`  ${a(opt.flag.padEnd(maxLen + 2))} ${d(opt.description)}\n`);
      }
    }
    if (cmd.examples && cmd.examples.length > 0) {
      out.write(`\n${b('Examples:')}\n`);
      for (const ex of cmd.examples) out.write(`  ${d(ex)}\n`);
    }
    if (cmd.apiDocs) {
      out.write(`\n${b('API Reference:')} ${d(REGIONS[region].docsHost + cmd.apiDocs)}\n`);
    }
    out.write(`\n${d('Global flags (--api-key, --output, --quiet, etc.) are always available.')}\n`);
  }

  private printChildren(node: CommandNode, prefix: string, out: NodeJS.WriteStream): void {
    const entries: Array<{ fullName: string; description: string }> = [];
    const collect = (n: CommandNode, p: string) => {
      for (const [name, child] of n.children) {
        if (child.command) entries.push({ fullName: `${p} ${name}`, description: child.command.description });
        if (child.children.size > 0) collect(child, `${p} ${name}`);
      }
    };
    collect(node, prefix);
    const maxLen = Math.max(...entries.map((e) => e.fullName.length));
    for (const { fullName, description } of entries) {
      out.write(`  ${this.accent(fullName.padEnd(maxLen), out)}  ${this.dim(description, out)}\n`);
    }
  }
}

export const registry = new CommandRegistry({
  'auth login': authLogin,
  'auth status': authStatus,
  'auth logout': authLogout,
  'config show': configShow,
  'config set': configSet,
  'models list': modelsList,
  'models get': modelsGet,
  'account show': accountShow,
  'file upload': fileUpload,
  'file list': fileList,
  'file get': fileGet,
  'file content': fileContent,
  'file delete': fileDelete,
  'token count': tokenCount,
  'text chat': textChat,
  'text messages': textMessages,
  'text responses': textResponses,
  'image generate': imageGenerate,
  'image edit': imageEdit,
  'speech synthesize': speechSynthesize,
  'speech recognize': speechRecognize,
});
