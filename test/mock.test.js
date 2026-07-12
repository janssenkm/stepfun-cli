// In-process contract tests against a local mock server. We call the compiled
// api layer directly (same-process fetch — loopback works in-process, unlike
// spawned children in restricted sandboxes) and assert request building +
// response parsing for JSON / SSE / binary / multipart paths. No real keys.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const api = {
  models: require('../dist/api/models.js'),
  account: require('../dist/api/account.js'),
  files: require('../dist/api/files.js'),
  token: require('../dist/api/token.js'),
  chat: require('../dist/api/chat.js'),
  image: require('../dist/api/image.js'),
  audio: require('../dist/api/audio.js'),
};

const seen = {};
const rec = (k, v) => (seen[k] = v);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-out-'));

function mockServer() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c.toString('utf-8')));
    req.on('end', () => {
      const p = req.url, ct = req.headers['content-type'] || '';
      const json = () => { try { return JSON.parse(body); } catch { return null; } };

      if (p === '/models') { rec('models', { method: req.method }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ object: 'list', data: [{ id: 'step-3.7-flash', object: 'model', owned_by: 'stepai' }] })); }
      if (p === '/accounts') { rec('accounts', { auth: req.headers['authorization'] }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ object: 'account', type: 'prepaid', balance: 5, total_cash_balance: 10, total_voucher_balance: 20 })); }
      if (p === '/files' && req.method === 'POST') { rec('files.upload', { multipart: ct.includes('multipart/form-data'), hasPurpose: body.includes('storage') }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ id: 'file-mock', object: 'file', bytes: 12, filename: 'x.png', purpose: 'storage', status: 'success' })); }

      if (p === '/token/count') { rec('token', json()); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: { total_tokens: 42 } })); }

      if (p === '/chat/completions') {
        const b = json();
        if (b && b.stream) {
          rec('chat.stream', b);
          res.setHeader('content-type', 'text/event-stream');
          if (b.model === 'toolcall') {
            // Two deltas targeting the same tool_call index → arguments must concatenate.
            res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":' } }] } }] }) + '\n\n');
            res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Beijing"}' } }] } }] }) + '\n\n');
            res.write('data: ' + JSON.stringify({ choices: [{ finish_reason: 'tool_calls' }] }) + '\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
          }
          res.write('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n');
          res.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
          res.write('data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n');
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        rec('chat.json', b);
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'hi back' }, finish_reason: 'stop' }], usage: { total_tokens: 3 } }));
      }

      if (p === '/messages') { rec('messages', json()); res.setHeader('content-type', 'text/event-stream'); res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}\n\n'); res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n'); return res.end(); }

      if (p === '/responses') { rec('responses', json()); res.setHeader('content-type', 'text/event-stream'); res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n'); res.write('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"total_tokens":2}}}\n\n'); return res.end(); }

      if (p === '/images/generations') { rec('image', json()); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ created: 1, data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', seed: 1, finish_reason: 'success' }] })); }

      if (p === '/audio/speech') {
        const b = json();
        if (b && b.stream_format === 'sse') {
          rec('tts.stream', b); res.setHeader('content-type', 'text/event-stream');
          res.write('data: {"type":"speech.audio.delta","audio":"' + Buffer.from('AUDIO1').toString('base64') + '"}\n\n');
          res.write('data: {"type":"speech.audio.delta","audio":"' + Buffer.from('AUDIO2').toString('base64') + '"}\n\n');
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        rec('tts.binary', b); res.setHeader('content-type', 'audio/mpeg'); return res.end(Buffer.from('FAKEMP3BYTES'));
      }

      if (p === '/audio/asr/sse') { rec('asr', json()); res.setHeader('content-type', 'text/event-stream'); res.write('data: {"type":"transcript.text.delta","delta":"hello"}\n\n'); res.write('data: {"type":"transcript.text.done","text":"hello"}\n\n'); return res.end(); }

      res.statusCode = 404; res.end();
    });
  });
}

let server, base, config;
test.before(() => new Promise((resolve) => {
  server = mockServer();
  server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    config = { apiKey: 'dummy-key', genBaseUrl: base, apiBaseUrl: base, region: 'StepPlan-Global', output: 'json', timeout: 10, verbose: false, quiet: true, noColor: true, yes: false, dryRun: false, nonInteractive: true };
    resolve();
  });
}));
test.after(() => server.close());

test('models.list / models.get → management base', async () => {
  const list = await api.models.listModels(config);
  assert.equal(list.data[0].id, 'step-3.7-flash');
  assert.equal(seen.models.method, 'GET');
});

test('account.getAccount → bearer auth', async () => {
  const acc = await api.account.getAccount(config);
  assert.equal(acc.balance, 5);
  assert.equal(seen.accounts.auth, 'Bearer dummy-key');
});

test('files.uploadFile sends multipart', async () => {
  const f = path.join(TMP, 'src.png');
  fs.writeFileSync(f, Buffer.from('iVBORw0KGgo', 'base64'));
  const obj = await api.files.uploadFile(config, { path: f, purpose: 'storage' });
  assert.equal(obj.id, 'file-mock');
  assert.equal(seen['files.upload'].multipart, true);
  assert.equal(seen['files.upload'].hasPurpose, true);
});

test('token.countTokens', async () => {
  const r = await api.token.countTokens(config, { model: 'step-3.7-flash', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.data.total_tokens, 42);
  assert.equal(seen.token.model, 'step-3.7-flash');
});

test('chat.createCompletion parses content', async () => {
  const r = await api.chat.createCompletion(config, { model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.content, 'hi back');
});

test('chat.streamCompletion concatenates deltas', async () => {
  const r = await api.chat.streamCompletion(config, { model: 'm', messages: [] });
  assert.equal(r.content, 'Hello');
  assert.equal(seen['chat.stream'].stream, true);
});

test('chat.streamCompletion tool-call accumulation', async () => {
  const r = await api.chat.streamCompletion(config, { model: 'toolcall', messages: [] });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].id, 'call_1');
  assert.equal(r.toolCalls[0].function.name, 'get_weather');
  assert.equal(r.toolCalls[0].function.arguments, '{"city":"Beijing"}');
});

test('messages.streamMessages parses Anthropic SSE', async () => {
  const r = await api.chat.streamMessages(config, { model: 'm', messages: [] });
  assert.equal(r.content, 'pong');
});

test('responses.streamResponses parses Responses SSE', async () => {
  const r = await api.chat.streamResponses(config, { model: 'm', input: 'hi' });
  assert.equal(r.content, 'ok');
  assert.equal(r.status, 'completed');
});

test('image.generateImage returns b64', async () => {
  const r = await api.image.generateImage(config, { model: 'step-image-edit-2', prompt: 'x' });
  assert.ok(r.data[0].b64_json.startsWith('iVBOR'));
});

test('audio.synthesize binary (closes live-engine gap)', async () => {
  const buf = await api.audio.synthesize(config, { model: 'stepaudio-2.5-tts', input: 'hi', voice: 'lively-girl' });
  assert.equal(buf.toString(), 'FAKEMP3BYTES');
  assert.equal(seen['tts.binary'].voice, 'lively-girl');
});

test('audio.synthesize SSE concatenates chunks', async () => {
  const buf = await api.audio.synthesize(config, { model: 'm', input: 'hi', voice: 'v', streamFormat: 'sse' });
  assert.equal(buf.toString(), 'AUDIO1AUDIO2');
  assert.equal(seen['tts.stream'].stream_format, 'sse');
});

test('audio.transcribe parses ASR SSE', async () => {
  const r = await api.audio.transcribe(config, { dataB64: 'AAAA', model: 'stepaudio-2.5-asr', formatType: 'wav' });
  assert.equal(r.text, 'hello');
});
