const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');

function runConfigScript(home, source) {
  return spawnSync(process.execPath, ['-e', source], {
    cwd: projectRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
  });
}

test('loadConfig accepts valid fields and ignores invalid or unknown fields', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-config-'));
  const directory = path.join(home, '.stepfun-cli');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({
    apiKey: 'secret',
    region: 'Global',
    output: 'yaml',
    timeout: -1,
    extra: true,
  }));

  const result = runConfigScript(home, `
    const { loadConfig } = require('./dist/config');
    process.stdout.write(JSON.stringify(loadConfig()));
  `);

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.apiKey, 'secret');
  assert.equal(parsed.region, 'StepPlan-Global');
  assert.ok(typeof parsed.configPath === 'string');
  assert.match(result.stderr, /field "output"/);
  assert.match(result.stderr, /field "timeout"/);
  assert.match(result.stderr, /field "extra"/);
  assert.doesNotMatch(result.stderr, /secret/);
});

test('loadConfig recovers from corrupt JSON with a warning', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-config-'));
  const directory = path.join(home, '.stepfun-cli');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'config.json'), '{invalid');

  const result = runConfigScript(home, `
    const { loadConfig } = require('./dist/config');
    process.stdout.write(JSON.stringify(loadConfig()));
  `);

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(typeof parsed.configPath === 'string');
  assert.match(result.stderr, /invalid JSON/);
});

test('saveConfig writes atomically with private directory and file permissions', { skip: process.platform === 'win32' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-config-'));
  const result = runConfigScript(home, `
    const { saveConfig } = require('./dist/config');
    saveConfig({ apiKey: 'first', region: 'StepPlan-CN' });
    saveConfig({ apiKey: 'second' });
  `);

  assert.equal(result.status, 0, result.stderr);
  const directory = path.join(home, '.stepfun-cli');
  const file = path.join(directory, 'config.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    apiKey: 'second',
    region: 'StepPlan-CN',
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(directory), ['config.json']);
});
