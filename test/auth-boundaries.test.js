const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-cli-test-'));
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      STEPFUN_API_KEY: '',
      HOME: options.home || makeHome(),
      ...(options.env || {})
    }
  });
}

test('config set region rejects invalid region with non-zero exit code', () => {
  const result = runCli(['config', 'set', 'region', 'Bad-Region']);

  // Invalid region is a USAGE error (exit code 2).
  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /Unknown region: Bad-Region/);
  assert.match(result.stderr + result.stdout, /StepPlan-CN, StepPlan-Global, PayGo-CN, PayGo-Global/);
});

test('auth status rejects invalid --region with non-zero exit code', () => {
  const result = runCli(['--api-key', 'BAD_REGION_KEY', '--region', 'Bad-Region', 'auth', 'status']);

  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /Unknown region: Bad-Region/);
});

test('business commands reject invalid --region before API calls', () => {
  const result = runCli(['--api-key', 'BAD_REGION_KEY', '--region', 'Bad-Region', 'text', 'chat', '--message', 'test']);

  assert.equal(result.status, 2);
  assert.match(result.stderr + result.stdout, /Unknown region: Bad-Region/);
});

test('config show masks persisted apiKey', () => {
  const home = makeHome();
  const setResult = runCli(['config', 'set', 'api_key', 'CONFIG_SHOW_KEY'], { home });
  assert.equal(setResult.status, 0);

  const showResult = runCli(['config', 'show'], { home });
  assert.equal(showResult.status, 0);
  assert.doesNotMatch(showResult.stdout, /CONFIG_SHOW_KEY/);
  assert.match(showResult.stdout, /CONF\.\.\._KEY/);
});
