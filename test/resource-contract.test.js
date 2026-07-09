const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

function run(args) {
  return new Promise(resolve => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-resource-contract-'));
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, HOME: home, STEPFUN_API_KEY: '' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('global flags are accepted after nested commands', async () => {
  const result = await run(['auth', 'status', '--output', 'json', '--region', 'Global']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).region, 'StepPlan-Global');
});

test('unsupported resources have discoverable help and structured errors', async () => {
  const help = await run(['video', 'task', 'get', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--task-id <id>/);
  assert.match(help.stdout, /Global flags/);

  const result = await run(['video', 'generate', '--output', 'json']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const envelope = JSON.parse(result.stderr);
  assert.equal(envelope.error.code, 'UNSUPPORTED');
});

test('every unsupported command exits UNSUPPORTED without authentication', async () => {
  const commands = [
    ['auth', 'refresh'],
    ['text', 'repl'],
    ['speech', 'voices'],
    ['image', 'generate'],
    ['video', 'generate'],
    ['video', 'task', 'get'],
    ['video', 'download'],
    ['music', 'generate'],
    ['music', 'cover'],
    ['search', 'query'],
    ['search', 'web'],
    ['vision', 'describe'],
    ['quota', 'show']
  ];
  for (const command of commands) {
    const result = await run(['--output', 'json', ...command]);
    assert.equal(result.status, 2, `${command.join(' ')}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'UNSUPPORTED', command.join(' '));
    assert.match(envelope.error.message, /stepfun /);
  }
});

test('resource help exposes supported, partial, and unsupported commands', async () => {
  const expectations = {
    auth: ['login', 'status', 'refresh', 'logout'],
    text: ['chat', 'repl'],
    speech: ['synthesize', 'recognize', 'voices'],
    image: ['edit', 'generate'],
    video: ['generate', 'task', 'download'],
    music: ['generate', 'cover'],
    search: ['query'],
    vision: ['describe'],
    quota: ['show'],
    config: ['show', 'set', 'export-schema'],
    file: ['upload', 'list', 'get', 'content', 'delete'],
    models: ['list']
  };
  for (const [resource, commands] of Object.entries(expectations)) {
    const result = await run([resource, '--help']);
    assert.equal(result.status, 0, `${resource}: ${result.stderr}`);
    for (const command of commands) assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
});

test('config set accepts both positional and flag forms', async () => {
  const positional = await run(['config', 'set', 'output', 'json']);
  assert.equal(positional.status, 0, positional.stderr);

  const flags = await run(['config', 'set', '--key', 'output', '--value', 'json']);
  assert.equal(flags.status, 0, flags.stderr);
});

test('unsupported flags on supported commands fail explicitly', async () => {
  for (const args of [
    ['text', 'chat', '--message', 'hello', '--tool', '{}', '--output', 'json'],
    ['speech', 'synthesize', '--text-file', '-', '--output', 'json'],
    ['image', 'edit', '--file', 'input.png', '--prompt', 'edit', '--out', 'output.png', '--output', 'json']
  ]) {
    const result = await run(args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stderr).error.code, 'UNSUPPORTED');
  }
});

test('config export-schema derives tool schemas from the registered command tree', async () => {
  const one = await run(['config', 'export-schema', '--command', 'text chat']);
  assert.equal(one.status, 0, one.stderr);
  const schema = JSON.parse(one.stdout);
  assert.equal(schema.type, 'function');
  assert.equal(schema.function.name, 'text_chat');
  assert.equal(schema.function.parameters.properties.message.type, 'array');
  assert.equal(schema.function.parameters.properties.stream.type, 'boolean');

  const all = await run(['config', 'export-schema']);
  assert.equal(all.status, 0, all.stderr);
  const names = JSON.parse(all.stdout).map(item => item.function.name);
  assert.ok(names.includes('file_content'));
  assert.ok(names.includes('video_generate'));
  assert.ok(names.includes('config_export_schema'));
  assert.ok(names.includes('speech_generate'));
  assert.ok(names.includes('search_web'));

  const alias = await run(['config', 'export-schema', '--command', 'speech generate']);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(JSON.parse(alias.stdout).function.name, 'speech_generate');
});

test('config export-schema rejects an unknown command path', async () => {
  const result = await run(['config', 'export-schema', '--command', 'missing command', '--output', 'json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).error.code, 'USAGE');
});
