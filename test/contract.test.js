const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const BIN = path.resolve(__dirname, '../dist/index.js');

// Isolated HOME so we never touch the user's real ~/.stepfun-cli/config.json.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-home-'));

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, HOME: TMP_HOME, ...env },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

test('--version prints stepfun', () => {
  const r = run(['--version']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /stepfun/);
});

test('--help lists all resources', () => {
  const r = run(['--help']);
  assert.equal(r.code, 0);
  for (const res of ['text', 'image', 'speech', 'models', 'file', 'account', 'token', 'auth', 'config']) {
    assert.match(r.stderr, new RegExp(res));
  }
});

test('help <resource> shows group help', () => {
  const r = run(['help', 'text']);
  assert.match(r.stderr, /text chat/);
});

test('unknown command exits USAGE(2)', () => {
  const r = run(['frobnicate']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Unknown command/);
});

test('no api key → AUTH exit 3', () => {
  const r = run(['models', 'list'], { STEPFUN_API_KEY: '' });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /No API key/);
});

test('dry-run needs no key and prints the request', () => {
  const r = run(['text', 'chat', '--message', 'hi', '--dry-run', '--output', 'json'], {
    STEPFUN_API_KEY: '',
  });
  assert.equal(r.code, 0);
  const body = JSON.parse(r.stdout);
  assert.equal(body.request.path, '/chat/completions');
  assert.deepEqual(body.request.body.messages, [{ role: 'user', content: 'hi' }]);
});

test('dry-run for token count prepends system message', () => {
  const r = run(['token', 'count', '--system', 'be brief', '--message', 'hi', '--dry-run', '--output', 'json'], {
    STEPFUN_API_KEY: '',
  });
  assert.equal(r.code, 0);
  const body = JSON.parse(r.stdout);
  assert.deepEqual(body.request.body.messages, [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hi' },
  ]);
});

test('dry-run for management commands needs no key and makes no request', () => {
  const r = run(['models', 'list', '--dry-run', '--output', 'json'], { STEPFUN_API_KEY: '' });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).request, { method: 'GET', path: '/models' });
});

test('file delete dry-run bypasses confirmation and makes no request', () => {
  const r = run(['file', 'delete', 'file-x', '--dry-run', '--output', 'json'], { STEPFUN_API_KEY: '' });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).request, { method: 'DELETE', path: '/files/file-x' });
});

test('non-interactive file deletion requires --yes', () => {
  const r = run(['file', 'delete', 'file-x'], { STEPFUN_API_KEY: 'dummy' });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /requires --yes/);
});

test('region validation rejects bad value', () => {
  const r = run(['auth', 'status', '--region', 'eu']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Invalid region/);
});

test('invalid CLI and environment output formats exit USAGE(2)', () => {
  const cli = run(['auth', 'status', '--output', 'yaml']);
  assert.equal(cli.code, 2);
  assert.match(cli.stderr, /Invalid output format/);

  const env = run(['auth', 'status'], { STEPFUN_OUTPUT: 'yaml' });
  assert.equal(env.code, 2);
  assert.match(env.stderr, /Invalid output format/);
});

test('commands reject surplus positional arguments', () => {
  const withId = run(['models', 'get', 'first', 'second', '--dry-run']);
  assert.equal(withId.code, 2);
  assert.match(withId.stderr, /Too many positional arguments/);

  const withoutId = run(['models', 'list', 'extra', '--dry-run']);
  assert.equal(withoutId.code, 2);
  assert.match(withoutId.stderr, /Too many positional arguments/);

  const afterSeparator = run(['models', 'list', '--dry-run', '--', 'extra']);
  assert.equal(afterSeparator.code, 2);
  assert.match(afterSeparator.stderr, /Too many positional arguments/);
});
