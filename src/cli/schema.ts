import { Argument, Command, Option } from 'commander';

interface JsonSchema {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  default?: unknown;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

interface CommandEntry {
  command: Command;
  path: string;
}

/** Exports leaf commands from the live Commander tree as tool schemas. */
export function exportCommandSchemas(program: Command, requestedPath?: string): ToolSchema[] {
  const leaves = collectLeaves(program).flatMap(expandAliases);
  const selected = requestedPath
    ? leaves.filter(entry => entry.path === normalizePath(requestedPath))
    : leaves;
  if (requestedPath && selected.length === 0) {
    throw new Error(`Unknown command path: ${requestedPath}`);
  }
  return selected.map(entry => commandToToolSchema(entry.command, entry.path));
}

function collectLeaves(command: Command): Command[] {
  if (command.commands.length === 0) return command.parent ? [command] : [];
  return command.commands.flatMap(collectLeaves);
}

function commandToToolSchema(command: Command, path: string): ToolSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const argument of command.registeredArguments) addArgument(properties, required, argument);
  for (const option of command.options) addOption(properties, required, option);

  const parameters: JsonSchema = { type: 'object', properties };
  if (required.length > 0) parameters.required = required;
  return {
    type: 'function',
    function: {
      name: path.replace(/[^a-zA-Z0-9_]+/g, '_'),
      description: command.description(),
      parameters
    }
  };
}

function expandAliases(command: Command): CommandEntry[] {
  const canonical = commandPath(command);
  const prefix = canonical.split(' ').slice(0, -1).join(' ');
  return [
    { command, path: canonical },
    ...command.aliases().map(alias => ({ command, path: `${prefix} ${alias}`.trim() }))
  ];
}

function addArgument(properties: Record<string, JsonSchema>, required: string[], argument: Argument): void {
  const name = argument.name();
  properties[name] = {
    type: argument.variadic ? 'array' : 'string',
    description: argument.description || `Positional argument: ${name}`,
    ...(argument.variadic ? { items: { type: 'string' } } : {})
  };
  if (argument.required) required.push(name);
}

function addOption(properties: Record<string, JsonSchema>, required: string[], option: Option): void {
  if (option.long === '--help') return;
  const name = option.attributeName();
  const scalarType = inferType(option);
  const repeatable = option.variadic || /repeatable/i.test(option.description);
  const existing = properties[name];
  properties[name] = {
    type: repeatable ? 'array' : scalarType,
    description: existing ? mergeDescriptions(existing.description, option.description) : option.description,
    ...(repeatable ? { items: { type: scalarType } } : {}),
    ...(option.defaultValue !== undefined ? { default: option.defaultValue } : {})
  };
  if (option.mandatory) required.push(name);
}

function mergeDescriptions(first = '', second = ''): string {
  if (first === second) return first;
  if (/stream/i.test(first) && /stream/i.test(second)) return 'Enable or disable streaming.';
  return `${first} / ${second}`;
}

function inferType(option: Option): string {
  if (!option.required && !option.optional) return 'boolean';
  const token = option.flags.match(/[<[]([^>\]]+)[>\]]/)?.[1]?.toLowerCase() || '';
  return /(number|seconds|count|int|pixels|hz|bps)/.test(token) ? 'number' : 'string';
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

function normalizePath(value: string): string {
  return value.trim().replace(/^stepfun\s+/, '').replace(/\s+/g, ' ');
}
