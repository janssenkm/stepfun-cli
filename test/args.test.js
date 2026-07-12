const test = require('node:test');
const assert = require('node:assert');
const { parseFlags, scanCommandPath } = require('../dist/args.js');
const { GLOBAL_OPTIONS } = require('../dist/command.js');

test('scanCommandPath skips global flag values', () => {
  assert.deepEqual(scanCommandPath(['--output', 'json', 'text', 'chat'], GLOBAL_OPTIONS), ['text', 'chat']);
});

test('scanCommandPath handles --flag=value', () => {
  assert.deepEqual(scanCommandPath(['--output=json', 'text', 'chat'], GLOBAL_OPTIONS), ['text', 'chat']);
});

test('scanCommandPath stops at --', () => {
  assert.deepEqual(scanCommandPath(['text', 'chat', '--', 'literal'], GLOBAL_OPTIONS), ['text', 'chat']);
});

test('parseFlags parses string / number / boolean / array', () => {
  const opts = [
    ...GLOBAL_OPTIONS,
    { flag: '--message <text>', type: 'array' },
    { flag: '--max-tokens <n>', type: 'number' },
    { flag: '--stream', description: 'bool' },
  ];
  const f = parseFlags(
    ['--api-key', 'k', '--message', 'a', '--message', 'b', '--max-tokens', '64', '--stream'],
    opts,
  );
  assert.equal(f.apiKey, 'k');
  assert.deepEqual(f.message, ['a', 'b']);
  assert.equal(f.maxTokens, 64);
  assert.equal(f.stream, true);
});

test('parseFlags supports --flag=value', () => {
  const f = parseFlags(['--model=gpt-x'], [...GLOBAL_OPTIONS, { flag: '--model <id>' }]);
  assert.equal(f.model, 'gpt-x');
});

test('parseFlags throws on missing value', () => {
  assert.throws(() => parseFlags(['--model'], [{ flag: '--model <id>' }]), /requires a value/);
});

test('parseFlags throws on non-numeric number flag', () => {
  assert.throws(
    () => parseFlags(['--max-tokens', 'abc'], [{ flag: '--max-tokens <n>', type: 'number' }]),
    /numeric/,
  );
});
