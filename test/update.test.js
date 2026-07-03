const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { compareVersions, runUpdate } = require('../dist/update.js');

async function registryResponse(status, body) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    log: message => stdout.push(message),
    error: message => stderr.push(message)
  };
}

test('version comparison handles releases and prereleases', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3'), -1);
});

test('update --check reports current and latest versions without invoking npm', async () => {
  const registry = await registryResponse(200, { version: '9.0.0' });
  const output = capture();
  try {
    const code = await runUpdate({
      currentVersion: '1.0.0',
      checkOnly: true,
      registry: registry.url,
      npmCommand: path.join(os.tmpdir(), 'must-not-run-npm'),
      ...output
    });
    assert.equal(code, 0);
    assert.deepEqual(registry.requests, ['/%40stepfun-ai%2Fcli/latest']);
    assert.match(output.stdout.join('\n'), /Current version: 1\.0\.0/);
    assert.match(output.stdout.join('\n'), /Latest version: 9\.0\.0/);
    assert.match(output.stdout.join('\n'), /update is available/);
  } finally {
    await registry.close();
  }
});

test('already-current update does not invoke npm', async () => {
  const registry = await registryResponse(200, { version: '1.2.3' });
  const output = capture();
  try {
    const code = await runUpdate({
      currentVersion: '1.2.3',
      registry: registry.url,
      npmCommand: path.join(os.tmpdir(), 'must-not-run-npm'),
      ...output
    });
    assert.equal(code, 0);
    assert.match(output.stdout.join('\n'), /already up to date/);
  } finally {
    await registry.close();
  }
});

test('registry and malformed metadata failures are explicit', async () => {
  for (const [status, body, expected] of [
    [503, { error: 'down' }, /HTTP 503/],
    [200, { name: '@stepfun-ai/cli' }, /does not contain a version/]
  ]) {
    const registry = await registryResponse(status, body);
    const output = capture();
    try {
      assert.equal(await runUpdate({ currentVersion: '1.0.0', registry: registry.url, ...output }), 1);
      assert.match(output.stderr.join('\n'), /Update check failed/);
      assert.match(output.stderr.join('\n'), expected);
    } finally {
      await registry.close();
    }
  }
});

test('standalone binary refuses npm self-update', async () => {
  const registry = await registryResponse(200, { version: '2.0.0' });
  const output = capture();
  try {
    const code = await runUpdate({
      currentVersion: '1.0.0',
      registry: registry.url,
      standalone: true,
      npmCommand: path.join(os.tmpdir(), 'must-not-run-npm'),
      ...output
    });
    assert.equal(code, 1);
    assert.match(output.stderr.join('\n'), /standalone binary/);
    assert.match(output.stderr.join('\n'), /Releases/);
  } finally {
    await registry.close();
  }
});

test('npm upgrade uses fixed argument array and reports success', async () => {
  const registry = await registryResponse(200, { version: '2.0.0' });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-fake-npm-'));
  const argumentsFile = path.join(temp, 'arguments.json');
  const fakeNpm = path.join(temp, 'npm');
  fs.writeFileSync(fakeNpm, `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(argumentsFile)}, JSON.stringify(process.argv.slice(2)))\n`);
  fs.chmodSync(fakeNpm, 0o755);
  const output = capture();
  try {
    const code = await runUpdate({
      currentVersion: '1.0.0',
      registry: registry.url,
      standalone: false,
      npmCommand: fakeNpm,
      ...output
    });
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(argumentsFile, 'utf8')), [
      'install', '--global', '@stepfun-ai/cli@latest'
    ]);
    assert.match(output.stdout.join('\n'), /Updated successfully to 2\.0\.0/);
  } finally {
    await registry.close();
  }
});

test('npm non-zero exit is an explicit upgrade failure', async () => {
  const registry = await registryResponse(200, { version: '2.0.0' });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-fake-npm-fail-'));
  const fakeNpm = path.join(temp, 'npm');
  fs.writeFileSync(fakeNpm, '#!/usr/bin/env node\nprocess.exit(7)\n');
  fs.chmodSync(fakeNpm, 0o755);
  const output = capture();
  try {
    const code = await runUpdate({
      currentVersion: '1.0.0',
      registry: registry.url,
      standalone: false,
      npmCommand: fakeNpm,
      ...output
    });
    assert.equal(code, 1);
    assert.match(output.stderr.join('\n'), /npm exited with code 7/);
  } finally {
    await registry.close();
  }
});
