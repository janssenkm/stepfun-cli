const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-cli-contract-'));
}

function runCli(args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        HOME: options.home || makeHome(),
        STEPFUN_API_KEY: '',
        ...(options.env || {})
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function startServer(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8')
      });
      respond(req, res);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

test('canonical regions and aliases resolve to their exact contract URLs', async () => {
  const regions = {
    'StepPlan-Global': 'https://api.stepfun.ai/step_plan/v1',
    'Global': 'https://api.stepfun.ai/step_plan/v1',
    'StepFun-Global': 'https://api.stepfun.ai/step_plan/v1',
    'StepPlan-CN': 'https://api.stepfun.com/step_plan/v1',
    'CN': 'https://api.stepfun.com/step_plan/v1'
  };

  for (const [region, baseUrl] of Object.entries(regions)) {
    const result = await runCli([
      '--api-key', 'region-test-key',
      '--region', region,
      '--output', 'json',
      'auth', 'status'
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).baseUrl, baseUrl);
  }
});

test('CLI auth and endpoint options override environment, which overrides config (flag > env > config)', async () => {
  const envServer = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'env' } }] }));
  });
  const overrideServer = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'overridden' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'CONFIG_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', 'https://invalid-config-host.invalid/v1'], { home })).status, 0);

    // Environment now wins over the persisted config.
    const fromEnv = await runCli(
      ['--output', 'text', '--base-url', envServer.url, 'text', 'chat', '--message', 'one'],
      { home, env: { STEPFUN_API_KEY: 'ENV_KEY' } }
    );
    assert.equal(fromEnv.status, 0, fromEnv.stderr);
    assert.equal(envServer.requests[0].authorization, 'Bearer ENV_KEY');

    // The flag still wins over the environment.
    const overridden = await runCli([
      '--api-key', 'FLAG_KEY',
      '--base-url', overrideServer.url,
      '--output', 'text',
      'text', 'chat', '--message', 'two'
    ], { home, env: { STEPFUN_API_KEY: 'ENV_KEY' } });
    assert.equal(overridden.status, 0, overridden.stderr);
    assert.equal(overridden.stdout.trim(), 'overridden');
    assert.equal(overrideServer.requests[0].authorization, 'Bearer FLAG_KEY');
  } finally {
    await Promise.all([envServer.close(), overrideServer.close()]);
  }
});

test('environment key is used when no flag or persisted key exists', async () => {
  const result = await runCli(['--region', 'Global', '--output', 'json', 'auth', 'status'], {
    env: { STEPFUN_API_KEY: 'ENVIRONMENT_KEY' }
  });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.authSource, 'STEPFUN_API_KEY');
  assert.equal(status.apiKey, 'ENVI..._KEY');
});

test('missing authentication fails before making a network request', async () => {
  const result = await runCli(['text', 'chat', '--message', 'must not send']);
  // Missing API key is an AUTH error (exit code 3).
  assert.equal(result.status, 3);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /API key is required/);
});

test('keys of eight characters or fewer are fully masked in text and JSON output', async () => {
  for (const outputArgs of [[], ['--output', 'json']]) {
    const result = await runCli([
      '--api-key', 'short123',
      '--region', 'Global',
      ...outputArgs,
      'auth', 'status'
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /short123/);
    assert.match(result.stdout, /\*{8}/);
  }
});

test('API non-success status is reported verbatim and exits non-zero', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end('{"error":"rate limited"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'error-key', '--base-url', server.url,
      'text', 'chat', '--message', 'trigger error'
    ]);
    // 429 is a QUOTA error (exit code 4). The runner is not a TTY, so
    // the error is emitted as a structured JSON envelope on stderr.
    assert.equal(result.status, 4);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'QUOTA');
    assert.match(envelope.error.message, /API Error \(429\): \{"error":"rate limited"\}/);
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});

test('chat text output extracts content while JSON output preserves the response', async () => {
  const payload = {
    id: 'response-id',
    choices: [{ message: { role: 'assistant', content: 'formatted answer' } }]
  };
  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  try {
    const common = ['--api-key', 'output-key', '--base-url', server.url];
    const textResult = await runCli([...common, '--output', 'text', 'text', 'chat', '--message', 'text']);
    assert.equal(textResult.status, 0, textResult.stderr);
    assert.equal(textResult.stdout.trim(), 'formatted answer');

    const jsonResult = await runCli([
      ...common, '--output', 'json', 'text', 'chat', '--message', 'json'
    ]);
    assert.equal(jsonResult.status, 0, jsonResult.stderr);
    assert.deepEqual(JSON.parse(jsonResult.stdout), payload);
  } finally {
    await server.close();
  }
});

// --- Structured error codes (Block D2b) ---
// The CLI classifies failures into exit codes 0/1/2/3/4/5/6/10 and, in JSON mode,
// emits `{ error: { code, message, hint? } }` on stderr.

test('missing API key exits AUTH(3) and emits a JSON AUTH envelope on stderr', async () => {
  const result = await runCli(['--output', 'json', 'text', 'chat', '--message', 'no key']);
  assert.equal(result.status, 3);
  assert.equal(result.stdout, '');
  const envelope = JSON.parse(result.stderr);
  assert.equal(envelope.error.code, 'AUTH');
  assert.match(envelope.error.message, /API key is required/);
});

test('NaN --temperature exits USAGE(2) and emits a JSON USAGE envelope on stderr', async () => {
  const result = await runCli([
    '--api-key', 'USAGE_KEY', '--output', 'json',
    'text', 'chat', '--message', 'hi', '--temperature', 'abc'
  ]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const envelope = JSON.parse(result.stderr);
  assert.equal(envelope.error.code, 'USAGE');
  assert.match(envelope.error.message, /Invalid --temperature/);
});

test('an unreachable host exits NETWORK(6) with a JSON NETWORK envelope on stderr', async () => {
  // Port 1 on the loopback is not a listening server; the connection is
  // refused, which the classifier maps to NETWORK.
  const result = await runCli([
    '--api-key', 'NET_KEY',
    '--base-url', 'http://127.0.0.1:1/v1',
    '--output', 'json',
    '--timeout', '3',
    'text', 'chat', '--message', 'hi'
  ]);
  assert.equal(result.status, 6);
  assert.equal(result.stdout, '');
  const envelope = JSON.parse(result.stderr);
  assert.equal(envelope.error.code, 'NETWORK');
  assert.ok(typeof envelope.error.message === 'string' && envelope.error.message.length > 0);
});

test('a 401 response exits AUTH(3) with a JSON AUTH envelope on stderr', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end('{"error":"invalid api key"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'BAD_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'AUTH');
    assert.match(envelope.error.message, /API Error \(401\)/);
  } finally {
    await server.close();
  }
});

test('a 402 response exits QUOTA(4) with a JSON QUOTA envelope on stderr', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(402, { 'content-type': 'application/json' });
    res.end('{"error":"insufficient balance"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'QUOTA_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 4);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'QUOTA');
    assert.match(envelope.error.message, /API Error \(402\)/);
  } finally {
    await server.close();
  }
});

test('a 451 response exits CONTENT_FILTER(10) with a JSON CONTENT_FILTER envelope on stderr', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(451, { 'content-type': 'application/json' });
    res.end('{"error":"content blocked by moderation"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'CF_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 10);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'CONTENT_FILTER');
    assert.match(envelope.error.message, /API Error \(451\)/);
  } finally {
    await server.close();
  }
});

test('a non-451 response with content moderation keywords exits CONTENT_FILTER(10)', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"error":"Content Filter triggered for this request"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'CF_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 10);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'CONTENT_FILTER');
  } finally {
    await server.close();
  }
});

test('a 408 response exits TIMEOUT(5) with a JSON TIMEOUT envelope on stderr', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(408, { 'content-type': 'application/json' });
    res.end('{"error":"request timeout"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'TO_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'TIMEOUT');
    assert.match(envelope.error.message, /API Error \(408\)/);
  } finally {
    await server.close();
  }
});

test('a 504 response exits TIMEOUT(5) with a JSON TIMEOUT envelope on stderr', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(504, { 'content-type': 'application/json' });
    res.end('{"error":"gateway timeout"}');
  });
  try {
    const result = await runCli([
      '--api-key', 'TO_KEY', '--base-url', server.url,
      '--output', 'json',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, 'TIMEOUT');
    assert.match(envelope.error.message, /API Error \(504\)/);
  } finally {
    await server.close();
  }
});

test('a successful request still exits 0 (regression after error-code refactor)', async () => {
  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  try {
    const result = await runCli([
      '--api-key', 'OK_KEY', '--base-url', server.url,
      '--output', 'text',
      'text', 'chat', '--message', 'hi'
    ]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'ok');
  } finally {
    await server.close();
  }
});
