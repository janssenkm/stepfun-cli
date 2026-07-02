const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const packageJson = require('../package.json');

const cliPath = path.join(__dirname, '..', 'dist', 'index.js');
const userAgent = `stepfun-cli/${packageJson.version}`;

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-cli-e2e-'));
}

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        STEPFUN_API_KEY: '',
        HOME: options.home || makeHome(),
        ...(options.env || {})
      },
      cwd: options.cwd || path.join(__dirname, '..')
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function startMockServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readRequestBody(req);
    const record = { method: req.method, url: req.url, headers: req.headers, body };
    requests.push(record);
    await handler(req, res, record);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

test('config auth status and models list work as an end-to-end CLI flow', async () => {
  const home = makeHome();

  const regionResult = await runCli(['config', 'set', 'region', 'StepPlan-Global'], { home });
  assert.equal(regionResult.status, 0);

  const apiKeyResult = await runCli(['config', 'set', 'api_key', 'E2E_CONFIG_KEY'], { home });
  assert.equal(apiKeyResult.status, 0);

  const statusResult = await runCli(['--output', 'json', 'auth', 'status'], { home });
  assert.equal(statusResult.status, 0);
  const authStatus = JSON.parse(statusResult.stdout);
  assert.deepEqual(authStatus, {
    authenticated: true,
    authSource: 'config',
    apiKey: 'E2E_..._KEY',
    region: 'StepPlan-Global',
    baseUrl: 'https://api.stepfun.ai/step_plan/v1'
  });

  const modelsResult = await runCli(['--output', 'json', 'models', 'list'], { home });
  assert.equal(modelsResult.status, 0);
  const models = JSON.parse(modelsResult.stdout);
  assert.deepEqual(models.text, ['step-3.5-flash', 'step-3.5-flash-2603', 'step-3.7-flash']);
  assert.deepEqual(models.speech, ['stepaudio-2.5-tts', 'stepaudio-2.5-asr']);
  assert.deepEqual(models.image, ['step-image-edit-2']);
});

test('text chat sends configured auth and request body to the API endpoint', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'mocked reply' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_TEXT_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(['text', 'chat', '--prompt', 'hello e2e', '--model', 'step-3.7-flash'], { home });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'mocked reply');
    assert.equal(server.requests.length, 1);

    const request = server.requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer E2E_TEXT_KEY');
    assert.equal(request.headers['user-agent'], userAgent);
    assert.equal(request.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(request.body), {
      model: 'step-3.7-flash',
      messages: [{ role: 'user', content: 'hello e2e' }]
    });
  } finally {
    await server.close();
  }
});

test('speech synthesize writes API audio response to the requested output file', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('FAKEAUDIO'));
  });

  try {
    const home = makeHome();
    const outputFile = path.join(home, 'speech.wav');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_SPEECH_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'speech', 'synthesize',
      '--text', '你好，端到端测试',
      '--voice', 'testvoice',
      '--output', outputFile
    ], { home });

    assert.equal(result.status, 0);
    assert.equal(fs.readFileSync(outputFile, 'utf8'), 'FAKEAUDIO');
    assert.equal(server.requests.length, 1);

    const request = server.requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/audio/speech');
    assert.equal(request.headers.authorization, 'Bearer E2E_SPEECH_KEY');
    assert.equal(request.headers['user-agent'], userAgent);
    assert.equal(request.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(request.body), {
      model: 'stepaudio-2.5-tts',
      input: '你好，端到端测试',
      voice: 'testvoice'
    });
  } finally {
    await server.close();
  }
});

test('speech recognize sends auth, user agent, and multipart boundary headers', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: 'recognized text' }));
  });

  try {
    const home = makeHome();
    const audioFile = path.join(home, 'input.wav');
    fs.writeFileSync(audioFile, 'FAKEAUDIO');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_ASR_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'speech', 'recognize',
      '--file', audioFile,
      '--model', 'stepaudio-2.5-asr'
    ], { home });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /recognized text/);
    assert.equal(server.requests.length, 1);

    const request = server.requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/audio/transcriptions');
    assert.equal(request.headers.authorization, 'Bearer E2E_ASR_KEY');
    assert.equal(request.headers['user-agent'], userAgent);
    assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(request.body, /name="model"/);
    assert.match(request.body, /stepaudio-2.5-asr/);
  } finally {
    await server.close();
  }
});

test('image edit sends auth, user agent, and multipart boundary headers', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { image_urls: ['https://example.test/image.png'] } }));
  });

  try {
    const home = makeHome();
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(imageFile, 'FAKEPNG');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_IMAGE_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'image', 'edit',
      '--file', imageFile,
      '--prompt', 'make it sharper',
      '--model', 'step-image-edit-2'
    ], { home });

    assert.equal(result.status, 0);
    assert.equal(server.requests.length, 1);

    const request = server.requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/images/edits');
    assert.equal(request.headers.authorization, 'Bearer E2E_IMAGE_KEY');
    assert.equal(request.headers['user-agent'], userAgent);
    assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(request.body, /name="model"/);
    assert.match(request.body, /step-image-edit-2/);
    assert.match(request.body, /name="prompt"/);
    assert.match(request.body, /make it sharper/);
  } finally {
    await server.close();
  }
});
