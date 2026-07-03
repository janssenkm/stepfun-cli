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

    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin);
    }

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

    const result = await runCli(['--output', 'text', 'text', 'chat', '--message', 'hello e2e', '--model', 'step-3.7-flash'], { home });
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

test('speech recognize sends documented JSON payload and parses the final SSE event', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end([
      'data: {"type":"transcript.text.delta","delta":"recognized "}',
      '',
      'data: {"type":"transcript.text.done","text":"recognized text","usage":{"total_tokens":2}}',
      '',
      'data: [DONE]',
      ''
    ].join('\n'));
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
    assert.equal(request.url, '/audio/asr/sse');
    assert.equal(request.headers.authorization, 'Bearer E2E_ASR_KEY');
    assert.equal(request.headers['user-agent'], userAgent);
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(request.headers.accept, 'text/event-stream');
    assert.deepEqual(JSON.parse(request.body), {
      audio: {
        data: Buffer.from('FAKEAUDIO').toString('base64'),
        input: {
          transcription: { model: 'stepaudio-2.5-asr', enable_itn: true },
          format: { type: 'wav' }
        }
      }
    });
  } finally {
    await server.close();
  }
});

test('image edit sends auth, user agent, and multipart boundary headers', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'ZmFrZQ==' }] }));
  });

  try {
    const home = makeHome();
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(imageFile, 'FAKEPNG');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_IMAGE_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet', '--output', 'text',
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
    assert.match(request.body, /name="response_format"/);
    assert.match(request.body, /b64_json/);
    assert.equal(result.stdout.trim(), 'ZmFrZQ==');
  } finally {
    await server.close();
  }
});

test('speech synthesize default voice is chosen by geography (PayGo-CN / PayGo-Global)', async () => {
  async function captureVoiceForRegion(region) {
    const server = await startMockServer(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'audio/wav' });
      res.end(Buffer.from('FAKEAUDIO'));
    });
    try {
      const home = makeHome();
      const outputFile = path.join(home, 'speech.wav');
      assert.equal((await runCli(['config', 'set', 'api_key', 'VOICE_KEY'], { home })).status, 0);
      assert.equal((await runCli(['config', 'set', 'region', region], { home })).status, 0);
      assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

      const result = await runCli([
        '--quiet',
        'speech', 'synthesize',
        '--text', 'hi',
        '--output', outputFile
      ], { home });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(server.requests.length, 1);
      return JSON.parse(server.requests[0].body).voice;
    } finally {
      await server.close();
    }
  }

  assert.equal(await captureVoiceForRegion('PayGo-CN'), 'cixingnansheng');
  assert.equal(await captureVoiceForRegion('PayGo-Global'), 'lively-girl');
});

test('StepPlan-CN speech synthesize warns on stderr and still sends the request', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('FAKEAUDIO'));
  });

  try {
    const home = makeHome();
    const outputFile = path.join(home, 'speech.wav');
    assert.equal((await runCli(['config', 'set', 'api_key', 'STEPPLAN_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'region', 'StepPlan-CN'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      'speech', 'synthesize',
      '--text', '你好',
      '--voice', 'testvoice',
      '--output', outputFile
    ], { home });

    // Warns but does not block: request still goes out and exit code is 0.
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(outputFile, 'utf8'), 'FAKEAUDIO');
    assert.equal(server.requests.length, 1);
    assert.match(result.stderr, /speech synthesize under StepPlan-CN/);
    assert.match(result.stderr, /not covered by official docs/);
  } finally {
    await server.close();
  }
});

test('StepPlan speech synthesize warning is suppressed by --quiet', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('FAKEAUDIO'));
  });

  try {
    const home = makeHome();
    const outputFile = path.join(home, 'speech.wav');
    assert.equal((await runCli(['config', 'set', 'api_key', 'STEPPLAN_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'region', 'StepPlan-Global'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'speech', 'synthesize',
      '--text', '你好',
      '--voice', 'testvoice',
      '--output', outputFile
    ], { home });

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /not covered by official docs/);
    assert.doesNotMatch(result.stderr, /StepPlan/);
  } finally {
    await server.close();
  }
});

test('StepPlan speech recognize and image edit both warn on stderr', async () => {
  const asrServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"transcript.text.done","text":"ok"}\n\ndata: [DONE]\n\n');
  });
  const imageServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'ZmFrZQ==' }] }));
  });

  try {
    const home = makeHome();
    const audioFile = path.join(home, 'input.wav');
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(audioFile, 'FAKEAUDIO');
    fs.writeFileSync(imageFile, 'FAKEPNG');
    assert.equal((await runCli(['config', 'set', 'api_key', 'STEPPLAN_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'region', 'StepPlan-CN'], { home })).status, 0);

    const asrResult = await runCli([
      '--base-url', asrServer.baseUrl,
      'speech', 'recognize',
      '--file', audioFile,
      '--model', 'stepaudio-2.5-asr'
    ], { home });
    assert.equal(asrResult.status, 0, asrResult.stderr);
    assert.match(asrResult.stderr, /speech recognize under StepPlan-CN/);
    assert.match(asrResult.stderr, /not covered by official docs/);

    const imageResult = await runCli([
      '--base-url', imageServer.baseUrl,
      'image', 'edit',
      '--file', imageFile,
      '--prompt', 'sharpen'
    ], { home });
    assert.equal(imageResult.status, 0, imageResult.stderr);
    assert.match(imageResult.stderr, /image edit under StepPlan-CN/);
    assert.match(imageResult.stderr, /not covered by official docs/);
  } finally {
    await Promise.all([asrServer.close(), imageServer.close()]);
  }
});

test('StepPlan text chat does not emit the non-covered warning', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'STEPPLAN_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'region', 'StepPlan-CN'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(['text', 'chat', '--message', 'hi'], { home });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /not covered by official docs/);
  } finally {
    await server.close();
  }
});

test('text chat forwards optional sampling params and prepends the system message', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'brief reply' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_TEXT_OPTS_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      'text', 'chat',
      '--message', 'hi',
      '--temperature', '0.1',
      '--max-tokens', '50',
      '--top-p', '0.8',
      '--system', 'be brief'
    ], { home });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests.length, 1);

    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.temperature, 0.1);
    assert.equal(body.max_tokens, 50);
    assert.equal(body.top_p, 0.8);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'be brief');
    assert.equal(body.messages[body.messages.length - 1].role, 'user');
    assert.equal(body.messages[body.messages.length - 1].content, 'hi');
  } finally {
    await server.close();
  }
});

test('text chat --messages-file - reads a messages array from stdin and --message appends a user turn', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_MSG_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const messagesFile = path.join(home, 'messages.json');
    fs.writeFileSync(messagesFile, JSON.stringify([{ role: 'user', content: 'file turn' }]));

    // File path form.
    const fileResult = await runCli([
      'text', 'chat',
      '--messages-file', messagesFile,
      '--message', 'tail turn'
    ], { home });
    assert.equal(fileResult.status, 0, fileResult.stderr);
    const fileBody = JSON.parse(server.requests[server.requests.length - 1].body);
    assert.deepEqual(fileBody.messages, [
      { role: 'user', content: 'file turn' },
      { role: 'user', content: 'tail turn' }
    ]);

    // stdin form.
    const stdinResult = await runCli(
      ['text', 'chat', '--messages-file', '-'],
      { home, stdin: JSON.stringify([{ role: 'user', content: 'hi' }]) }
    );
    assert.equal(stdinResult.status, 0, stdinResult.stderr);
    const stdinBody = JSON.parse(server.requests[server.requests.length - 1].body);
    assert.deepEqual(stdinBody.messages, [{ role: 'user', content: 'hi' }]);
  } finally {
    await server.close();
  }
});

test('text chat --message is repeatable with role prefixes and --prompt remains an alias', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_MULTI_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const messageResult = await runCli([
      'text', 'chat',
      '--message', 'system:be concise',
      '--message', 'user:hello',
      '--message', 'assistant:hi',
      '--message', 'continue'
    ], { home });
    assert.equal(messageResult.status, 0, messageResult.stderr);
    assert.deepEqual(JSON.parse(server.requests.at(-1).body).messages, [
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'continue' }
    ]);

    const promptResult = await runCli(['text', 'chat', '--prompt', 'legacy'], { home });
    assert.equal(promptResult.status, 0, promptResult.stderr);
    assert.deepEqual(JSON.parse(server.requests.at(-1).body).messages, [
      { role: 'user', content: 'legacy' }
    ]);
  } finally {
    await server.close();
  }
});

test('text chat without --message or --messages-file exits non-zero', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_REQ_KEY'], { home })).status, 0);
  const result = await runCli(['text', 'chat'], { home });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /at least one of --message \/ --messages-file/);
});

// Mock handler that serves SSE when stream:true is requested, JSON otherwise.
function chatStreamOrJsonHandler(_req, res, record) {
  let parsed = {};
  try { parsed = JSON.parse(record.body); } catch (_) { /* ignore */ }
  if (parsed.stream === true) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.end('data: [DONE]\n\n');
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'mocked reply' } }] }));
  }
}

test('text chat --stream prints streamed tokens followed by a trailing newline', async () => {
  const server = await startMockServer(chatStreamOrJsonHandler);
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_STREAM_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(['--output', 'text', 'text', 'chat', '--stream', '--message', 'hi'], { home });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Hello\n');

    const request = server.requests[0];
    assert.equal(request.url, '/chat/completions');
    assert.equal(request.headers.accept, 'text/event-stream');
    assert.equal(JSON.parse(request.body).stream, true);
  } finally {
    await server.close();
  }
});

test('text chat stream reports reasoning status on stderr without exposing reasoning text', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"reasoning_content":"private reasoning"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"answer"}}]}\n\n');
    res.end('data: [DONE]\n\n');
  });
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_REASON_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(['--output', 'text', 'text', 'chat', '--stream', '--message', 'hi'], { home });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'answer\n');
    assert.match(result.stderr, /Thinking/);
    assert.match(result.stderr, /Response/);
    assert.doesNotMatch(result.stdout + result.stderr, /private reasoning/);

    const quiet = await runCli(['--quiet', '--output', 'text', 'text', 'chat', '--stream', '--message', 'hi'], { home });
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.stdout, 'answer\n');
    assert.equal(quiet.stderr, '');
  } finally {
    await server.close();
  }
});

test('text chat --no-stream falls back to the non-streaming JSON path', async () => {
  const server = await startMockServer(chatStreamOrJsonHandler);
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_NOSTREAM_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(['--output', 'text', 'text', 'chat', '--no-stream', '--message', 'hi'], { home });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'mocked reply');
    assert.equal(JSON.parse(server.requests[0].body).stream, undefined);
  } finally {
    await server.close();
  }
});

test('text chat --output json forces non-streaming even when --stream is passed', async () => {
  const server = await startMockServer(chatStreamOrJsonHandler);
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_JSON_FORCE_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--output', 'json', 'text', 'chat', '--stream', '--message', 'hi'],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    // Full JSON object is emitted, not streamed tokens.
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.choices[0].message.content, 'mocked reply');
    // The request must NOT have asked for streaming.
    assert.notEqual(JSON.parse(server.requests[0].body).stream, true);
  } finally {
    await server.close();
  }
});

test('text chat --stream forwards sampling params alongside stream:true', async () => {
  const server = await startMockServer(chatStreamOrJsonHandler);
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_STREAM_OPTS_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--output', 'text', 'text', 'chat', '--stream', '--temperature', '0.5', '--message', 'hi'],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Hello\n');
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.stream, true);
    assert.equal(body.temperature, 0.5);
  } finally {
    await server.close();
  }
});

test('text chat combines --messages-file with --stream', async () => {
  const server = await startMockServer(chatStreamOrJsonHandler);
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_STREAM_MSG_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const messagesFile = path.join(home, 'messages.json');
    fs.writeFileSync(messagesFile, JSON.stringify([{ role: 'user', content: 'file turn' }]));

    const result = await runCli(
      ['--output', 'text', 'text', 'chat', '--stream', '--messages-file', messagesFile],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Hello\n');
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.stream, true);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'file turn' }]);
  } finally {
    await server.close();
  }
});

test('speech synthesize forwards speed and response_format only when provided', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('FAKEAUDIO'));
  });

  try {
    const home = makeHome();
    const outputFile = path.join(home, 'speech.wav');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_TTS_OPTS_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'speech', 'synthesize',
      '--text', 'hi',
      '--voice', 'v',
      '--output', outputFile,
      '--speed', '1.5',
      '--format', 'wav'
    ], { home });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.speed, 1.5);
    assert.equal(body.response_format, 'wav');
    // Untouched optional params must not appear.
    assert.equal(body.volume, undefined);
    assert.equal(body.sample_rate, undefined);
  } finally {
    await server.close();
  }
});

test('speech recognize forwards language and hotwords into transcription', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"transcript.text.done","text":"ok"}\n\ndata: [DONE]\n\n');
  });

  try {
    const home = makeHome();
    const audioFile = path.join(home, 'input.wav');
    fs.writeFileSync(audioFile, 'FAKEAUDIO');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_ASR_OPTS_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'speech', 'recognize',
      '--file', audioFile,
      '--language', 'en',
      '--hotwords', 'a,b'
    ], { home });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.audio.input.transcription.language, 'en');
    assert.deepEqual(body.audio.input.transcription.hotwords, ['a', 'b']);
    // Existing fields are unchanged.
    assert.equal(body.audio.input.transcription.enable_itn, true);
    assert.equal(body.audio.input.transcription.model, 'stepaudio-2.5-asr');
  } finally {
    await server.close();
  }
});

test('image edit forwards seed, steps, cfg_scale and negative_prompt as multipart fields', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'ZmFrZQ==' }] }));
  });

  try {
    const home = makeHome();
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(imageFile, 'FAKEPNG');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_IMAGE_OPTS_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli([
      '--quiet',
      'image', 'edit',
      '--file', imageFile,
      '--prompt', 'sharpen',
      '--seed', '1',
      '--steps', '5',
      '--cfg-scale', '7',
      '--negative-prompt', 'blurry'
    ], { home });
    assert.equal(result.status, 0, result.stderr);
    const body = server.requests[0].body;
    assert.match(body, /name="seed"[\s\S]*\r\n1\r\n/);
    assert.match(body, /name="steps"[\s\S]*\r\n5\r\n/);
    assert.match(body, /name="cfg_scale"[\s\S]*\r\n7\r\n/);
    assert.match(body, /name="negative_prompt"[\s\S]*\r\nblurry\r\n/);
  } finally {
    await server.close();
  }
});

test('regression: commands without the new optional params omit them entirely from the request', async () => {
  const chatServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  const ttsServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('FAKEAUDIO'));
  });
  const asrServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"transcript.text.done","text":"ok"}\n\ndata: [DONE]\n\n');
  });
  const imageServer = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'ZmFrZQ==' }] }));
  });

  try {
    const home = makeHome();
    const audioFile = path.join(home, 'input.wav');
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(audioFile, 'FAKEAUDIO');
    fs.writeFileSync(imageFile, 'FAKEPNG');
    assert.equal((await runCli(['config', 'set', 'api_key', 'E2E_REGR_KEY'], { home })).status, 0);

    // chat
    assert.equal((await runCli(['--base-url', chatServer.baseUrl, 'text', 'chat', '--message', 'hi'], { home })).status, 0);
    const chatBody = JSON.parse(chatServer.requests[0].body);
    assert.equal('temperature' in chatBody, false);
    assert.equal('top_p' in chatBody, false);
    assert.equal('max_tokens' in chatBody, false);
    assert.deepEqual(chatBody.messages, [{ role: 'user', content: 'hi' }]);

    // synthesize
    const regrTtsOutput = path.join(home, 'regr.wav');
    assert.equal((await runCli(['--quiet', '--base-url', ttsServer.baseUrl, 'speech', 'synthesize', '--text', 'hi', '--voice', 'v', '--output', regrTtsOutput], { home })).status, 0);
    const ttsBody = JSON.parse(ttsServer.requests[0].body);
    assert.equal('response_format' in ttsBody, false);
    assert.equal('speed' in ttsBody, false);
    assert.equal('volume' in ttsBody, false);
    assert.equal('sample_rate' in ttsBody, false);

    // recognize
    assert.equal((await runCli(['--quiet', '--base-url', asrServer.baseUrl, 'speech', 'recognize', '--file', audioFile], { home })).status, 0);
    const asrTranscription = JSON.parse(asrServer.requests[0].body).audio.input.transcription;
    assert.equal('language' in asrTranscription, false);
    assert.equal('hotwords' in asrTranscription, false);

    // image edit
    assert.equal((await runCli(['--quiet', '--base-url', imageServer.baseUrl, 'image', 'edit', '--file', imageFile, '--prompt', 'sharpen'], { home })).status, 0);
    const imageBody = imageServer.requests[0].body;
    assert.doesNotMatch(imageBody, /name="seed"/);
    assert.doesNotMatch(imageBody, /name="steps"/);
    assert.doesNotMatch(imageBody, /name="cfg_scale"/);
    assert.doesNotMatch(imageBody, /name="negative_prompt"/);
  } finally {
    await Promise.all([chatServer.close(), ttsServer.close(), asrServer.close(), imageServer.close()]);
  }
});

// Non-TTY auto-json: stdout is not a TTY in the test runner, so omitting
// --output must default to JSON. The output must be parseable as JSON.
test('non-TTY with no --output defaults to JSON output', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'api_key', 'AUTOTTY_KEY'], { home })).status, 0);
  const result = await runCli(['auth', 'status'], { home });
  assert.equal(result.status, 0, result.stderr);
  // Must be valid JSON (would throw otherwise).
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.authenticated, true);
});

// Environment overrides config (flag > env > config > default).
test('STEPFUN_REGION env var overrides the persisted region in auth status', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'region', 'PayGo-CN'], { home })).status, 0);
  assert.equal((await runCli(['config', 'set', 'api_key', 'REGION_ENV_KEY'], { home })).status, 0);
  const result = await runCli(['--output', 'json', 'auth', 'status'], {
    home,
    env: { STEPFUN_REGION: 'PayGo-Global' }
  });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.region, 'PayGo-Global');
  assert.equal(status.baseUrl, 'https://api.stepfun.ai/v1');
});

// STEPFUN_OUTPUT env var forces JSON regardless of TTY.
test('STEPFUN_OUTPUT=json env var produces JSON output', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'api_key', 'OUTPUT_ENV_KEY'], { home })).status, 0);
  const result = await runCli(['auth', 'status'], {
    home,
    env: { STEPFUN_OUTPUT: 'json' }
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.authenticated, true);
});

// --timeout (seconds) is forwarded to the client and aborts slow requests.
test('--timeout <seconds> aborts a request that exceeds the configured timeout', async () => {
  const server = await startMockServer(async (_req, res) => {
    // Slower than the 1s timeout but well under the default 300s.
    await new Promise(resolve => setTimeout(resolve, 2000));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'late' } }] }));
  });
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'TIMEOUT_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--output', 'text', '--timeout', '1', 'text', 'chat', '--message', 'hi'],
      { home }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /timeout|abort/i);
  } finally {
    await server.close();
  }
});

// apiKey precedence: env > config.
test('apiKey from the environment takes precedence over the persisted config key', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'CONFIG_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--output', 'text', 'text', 'chat', '--message', 'hi'],
      { home, env: { STEPFUN_API_KEY: 'ENV_KEY' } }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests[0].headers.authorization, 'Bearer ENV_KEY');
  } finally {
    await server.close();
  }
});

// --dry-run prints a request summary and never calls the API.
test('text chat --dry-run prints the request URL and model and sends zero requests', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'should not be reached' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'DRYRUN_CHAT_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--dry-run', '--output', 'json', 'text', 'chat', '--message', 'hi', '--model', 'step-3.5-flash'],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests.length, 0);

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.command, 'text chat');
    assert.equal(summary.method, 'POST');
    assert.equal(summary.url, `${server.baseUrl}/chat/completions`);
    assert.equal(summary.model, 'step-3.5-flash');
    assert.deepEqual(summary.message, ['hi']);
    // No credential leakage.
    assert.equal(result.stdout.includes('DRYRUN_CHAT_KEY'), false);
  } finally {
    await server.close();
  }
});

test('text chat --dry-run does not require an API key', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'should not be reached' } }] }));
  });

  try {
    const result = await runCli(
      [
        '--dry-run',
        '--output', 'json',
        '--base-url', server.baseUrl,
        'text', 'chat',
        '--message', 'hi'
      ],
      { env: { STEPFUN_API_KEY: '' } }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests.length, 0);

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.url, `${server.baseUrl}/chat/completions`);
    assert.deepEqual(summary.message, ['hi']);
  } finally {
    await server.close();
  }
});

// --dry-run on image edit summarizes the file by path and byte size, never the
// binary/base64 content.
test('image edit --dry-run shows the image path and size without leaking its contents', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'should not be reached' }] }));
  });

  try {
    const home = makeHome();
    const imageFile = path.join(home, 'input.png');
    fs.writeFileSync(imageFile, 'FAKEPNG-DRYRUN');
    assert.equal((await runCli(['config', 'set', 'api_key', 'DRYRUN_IMAGE_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);

    const result = await runCli(
      ['--dry-run', '--output', 'json', 'image', 'edit', '--file', imageFile, '--prompt', 'x'],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests.length, 0);

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.command, 'image edit');
    assert.equal(summary.url, `${server.baseUrl}/images/edits`);
    assert.equal(summary.image.path, imageFile);
    assert.equal(summary.image.size, Buffer.byteLength('FAKEPNG-DRYRUN'));
    // The binary content and any base64 form must not appear.
    assert.equal(result.stdout.includes('FAKEPNG-DRYRUN'), false);
    assert.equal(result.stdout.includes(Buffer.from('FAKEPNG-DRYRUN').toString('base64')), false);
  } finally {
    await server.close();
  }
});

// --non-interactive blocks auth login's prompt and exits non-zero.
test('auth login --non-interactive refuses to prompt and exits non-zero', async () => {
  const home = makeHome();
  const result = await runCli(['--non-interactive', 'auth', 'login'], { home });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /config set api_key|--api-key/);
  assert.equal(result.stdout, '');
});

// auth logout --yes clears the persisted credentials.
test('auth logout --yes clears credentials and auth status reports unauthenticated', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'api_key', 'LOGOUT_KEY'], { home })).status, 0);
  assert.equal((await runCli(['config', 'set', 'region', 'PayGo-Global'], { home })).status, 0);

  const logoutResult = await runCli(['auth', 'logout', '--yes'], { home });
  assert.equal(logoutResult.status, 0, logoutResult.stderr);
  assert.match(logoutResult.stdout, /Credentials cleared/);

  // The config file must no longer carry apiKey/region.
  const saved = JSON.parse(fs.readFileSync(path.join(home, '.stepfun-cli', 'config.json'), 'utf8'));
  assert.equal('apiKey' in saved, false);
  assert.equal('region' in saved, false);

  const statusResult = await runCli(['--output', 'json', 'auth', 'status'], {
    home,
    env: { STEPFUN_API_KEY: '' }
  });
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.equal(status.authenticated, false);
});

// config default_text_model flows into text chat when -m is omitted.
test('config set default_text_model is used by text chat when --model is omitted', async () => {
  const server = await startMockServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });

  try {
    const home = makeHome();
    assert.equal((await runCli(['config', 'set', 'api_key', 'DEFAULT_MODEL_KEY'], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'base_url', server.baseUrl], { home })).status, 0);
    assert.equal((await runCli(['config', 'set', 'default_text_model', 'step-3.7-flash'], { home })).status, 0);

    const result = await runCli(
      ['--output', 'text', 'text', 'chat', '--message', 'hi'],
      { home }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(server.requests.length, 1);
    assert.equal(JSON.parse(server.requests[0].body).model, 'step-3.7-flash');
  } finally {
    await server.close();
  }
});

// config set output json is persisted and surfaced by config show.
test('config set output json persists and is reflected by config show', async () => {
  const home = makeHome();
  assert.equal((await runCli(['config', 'set', 'output', 'json'], { home })).status, 0);

  const showResult = await runCli(['config', 'show'], { home });
  assert.equal(showResult.status, 0, showResult.stderr);
  const shown = JSON.parse(showResult.stdout);
  assert.equal(shown.output, 'json');
});

test('invalid --output is rejected as a usage error', async () => {
  const result = await runCli(['--output', 'yaml', 'models', 'list']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown output: yaml/);
});
