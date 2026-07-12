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

test('parseFlags rejects unknown flags', () => {
  assert.throws(
    () => parseFlags(['--modle', 'step-3.7-flash'], [{ flag: '--model <id>' }]),
    /Unknown flag --modle/,
  );
});

test('parseFlags does not consume the next flag as a missing value', () => {
  assert.throws(
    () => parseFlags(['--model', '--stream'], [
      { flag: '--model <id>' },
      { flag: '--stream', description: 'bool' },
    ]),
    /Flag --model requires a value/,
  );
});

test('parseFlags accepts negative and zero numeric values for command validation', () => {
  const opts = [{ flag: '--temperature <n>', type: 'number' }];
  assert.equal(parseFlags(['--temperature', '-0.5'], opts).temperature, -0.5);
  assert.equal(parseFlags(['--temperature=0'], opts).temperature, 0);
});

test('parseFlags keeps the last repeated scalar and accumulates repeated arrays', () => {
  const flags = parseFlags(
    ['--model', 'first', '--model', 'second', '--tag=a', '--tag', 'b'],
    [{ flag: '--model <id>' }, { flag: '--tag <value>', type: 'array' }],
  );
  assert.equal(flags.model, 'second');
  assert.deepEqual(flags.tag, ['a', 'b']);
});

test('parseFlags preserves empty equals strings but rejects them for numbers', () => {
  assert.equal(parseFlags(['--label='], [{ flag: '--label <text>' }]).label, '');
  assert.throws(
    () => parseFlags(['--count='], [{ flag: '--count <n>', type: 'number' }]),
    /numeric/,
  );
});

test('parseFlags rejects values attached to boolean flags', () => {
  assert.throws(
    () => parseFlags(['--stream=false'], [{ flag: '--stream', description: 'bool' }]),
    /does not take a value/,
  );
});
