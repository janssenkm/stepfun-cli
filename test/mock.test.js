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
      const modelId = p.match(/^\/models\/([^/]+)$/);
      if (modelId) { rec('models.get', { id: decodeURIComponent(modelId[1]) }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ id: decodeURIComponent(modelId[1]), object: 'model', owned_by: 'stepai' })); }
      if (p === '/accounts') { rec('accounts', { auth: req.headers['authorization'] }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ object: 'account', type: 'prepaid', balance: 5, total_cash_balance: 10, total_voucher_balance: 20 })); }
      if (p === '/files' && req.method === 'POST') { rec('files.upload', { multipart: ct.includes('multipart/form-data'), hasPurpose: body.includes('storage') }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ id: 'file-mock', object: 'file', bytes: 12, filename: 'x.png', purpose: 'storage', status: 'success' })); }
      if ((p === '/files' || p.startsWith('/files?')) && req.method === 'GET') { const q = new URL('http://x' + req.url).searchParams; rec('files.list', { limit: q.get('limit'), order: q.get('order') }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ object: 'list', data: [{ id: 'file-x', object: 'file', bytes: 5, filename: 'a.png', status: 'success' }] })); }
      const fileId = p.match(/^\/files\/([^/]+)$/);
      if (fileId) { rec(req.method === 'DELETE' ? 'files.delete' : 'files.get', { id: fileId[1], method: req.method }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(req.method === 'DELETE' ? { id: fileId[1], object: 'file', deleted: true } : { id: fileId[1], object: 'file', bytes: 5, filename: 'a.png', status: 'success' })); }
      const fileContent = p.match(/^\/files\/([^/]+)\/content$/);
      if (fileContent) { rec('files.content', { id: fileContent[1] }); return res.end(Buffer.from('RAWFILEBYTES')); }

      if (p === '/token/count') { rec('token', json()); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: { total_tokens: 42 } })); }

      if (p === '/chat/completions') {
        const b = json();
          if (b && b.stream) {
            rec('chat.stream', b);
            res.setHeader('content-type', 'text/event-stream');
            if (b.model === 'stream-error') {
              res.write('event: error\ndata: {"type":"error","error":{"message":"overloaded"}}\n\n');
              return res.end();
            }
            if (b.model === 'deepseek') {
              res.write('data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n');
              res.write('data: [DONE]\n\n');
              return res.end();
            }
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
        return res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'hi back', ...(b.model === 'deepseek' ? { reasoning_content: 'think' } : {}) }, finish_reason: 'stop' }], usage: { total_tokens: 3 } }));
      }

      if (p === '/messages') {
        const b = json(); rec('messages', b);
        res.setHeader('content-type', 'text/event-stream');
        if (b && b.model === 'toolcall') {
          // tool_use block: start (id+name), two input_json_delta fragments, stop.
          res.write('event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} } }) + '\n\n');
          res.write('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"city":' } }) + '\n\n');
          res.write('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"Beijing"}' } }) + '\n\n');
          res.write('event: content_block_stop\ndata: ' + JSON.stringify({ type: 'content_block_stop', index: 0 }) + '\n\n');
          res.write('event: message_stop\ndata: ' + JSON.stringify({ type: 'message_stop' }) + '\n\n');
          return res.end();
        }
        res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}\n\n');
        res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
        return res.end();
      }

      if (p === '/responses') {
        const b = json(); rec('responses', b);
        res.setHeader('content-type', 'text/event-stream');
        if (b && b.model === 'toolcall') {
          // Completed response carrying a function_call output item.
          res.write('event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Beijing"}' }], usage: { total_tokens: 2 } } }) + '\n\n');
          return res.end();
        }
        res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n');
        res.write('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"total_tokens":2}}}\n\n');
        return res.end();
      }

      if (p === '/images/generations') { rec('image', json()); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ created: 1, data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', seed: 1, finish_reason: 'success' }] })); }
      if (p === '/images/edits') { rec('image.edit', { multipart: ct.includes('multipart/form-data') }); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ created: 1, data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', seed: 2, finish_reason: 'success' }] })); }

      if (p === '/audio/speech') {
        const b = json();
        if (b && b.stream_format === 'sse') {
          rec('tts.stream', b); res.setHeader('content-type', 'text/event-stream');
          res.write('data: {"type":"speech.audio.delta","audio":"' + Buffer.from('AUDIO1').toString('base64') + '"}\n\n');
          if (b.input === 'truncated') return res.end();
          res.write('data: {"type":"speech.audio.delta","audio":"' + Buffer.from('AUDIO2').toString('base64') + '"}\n\n');
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        rec('tts.binary', b); res.setHeader('content-type', 'audio/mpeg'); return res.end(Buffer.from('FAKEMP3BYTES'));
      }

      if (p === '/audio/asr/sse') { const b = json(); rec('asr', b); res.setHeader('content-type', 'text/event-stream'); res.write('data: {"type":"transcript.text.delta","delta":"hello"}\n\n'); if (b.audio.input.transcription.model !== 'truncated') res.write('data: {"type":"transcript.text.done","text":"hello"}\n\n'); return res.end(); }

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

test('models.list → management base', async () => {
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

test('chat completion reads deepseek-style reasoning in JSON and SSE', async () => {
  const json = await api.chat.createCompletion(config, { model: 'deepseek', messages: [] });
  assert.equal(json.reasoning, 'think');
  const stream = await api.chat.streamCompletion(config, { model: 'deepseek', messages: [] });
  assert.equal(stream.reasoning, 'think');
});

test('chat stream surfaces SSE error events', async () => {
  await assert.rejects(
    api.chat.streamCompletion(config, { model: 'stream-error', messages: [] }),
    /overloaded/,
  );
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

test('audio streams reject premature EOF', async () => {
  await assert.rejects(
    api.audio.synthesize(config, { model: 'm', input: 'truncated', voice: 'v', streamFormat: 'sse' }),
    /before completion/,
  );
  await assert.rejects(
    api.audio.transcribe(config, { dataB64: 'AAAA', model: 'truncated', formatType: 'wav' }),
    /before completion/,
  );
});

test('audio.transcribe parses ASR SSE', async () => {
  const r = await api.audio.transcribe(config, { dataB64: 'AAAA', model: 'stepaudio-2.5-asr', formatType: 'wav' });
  assert.equal(r.text, 'hello');
});

test('models.get → /models/{id}', async () => {
  const m = await api.models.getModel(config, 'step-3.7-flash');
  assert.equal(m.id, 'step-3.7-flash');
  assert.equal(seen['models.get'].id, 'step-3.7-flash');
});

test('files.list encodes query; files.get / delete / content', async () => {
  const list = await api.files.listFiles(config, { limit: 5, order: 'desc' });
  assert.equal(list.object, 'list');
  assert.equal(list.data[0].id, 'file-x');
  assert.equal(seen['files.list'].limit, '5');
  assert.equal(seen['files.list'].order, 'desc');

  const got = await api.files.getFile(config, 'file-x');
  assert.equal(got.id, 'file-x');
  assert.equal(seen['files.get'].method, 'GET');

  const del = await api.files.deleteFile(config, 'file-x');
  assert.equal(del.deleted, true);
  assert.equal(seen['files.delete'].method, 'DELETE');

  const contentRes = await api.files.getFileContent(config, 'file-x');
  assert.equal(Buffer.from(await contentRes.arrayBuffer()).toString(), 'RAWFILEBYTES');
});

test('image.editImage sends multipart', async () => {
  const f = path.join(TMP, 'edit.png');
  fs.writeFileSync(f, Buffer.from('iVBORw0KGgo', 'base64'));
  const r = await api.image.editImage(config, { model: 'step-image-edit-2', imagePath: f, prompt: 'x' });
  assert.ok(r.data[0].b64_json.startsWith('iVBOR'));
  assert.equal(seen['image.edit'].multipart, true);
});

test('messages.streamMessages parses tool_use', async () => {
  const r = await api.chat.streamMessages(config, { model: 'toolcall', messages: [] });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].id, 'toolu_1');
  assert.equal(r.toolCalls[0].name, 'get_weather');
  assert.deepEqual(r.toolCalls[0].input, { city: 'Beijing' });
});

test('responses.streamResponses parses function_call', async () => {
  const r = await api.chat.streamResponses(config, { model: 'toolcall', input: 'x' });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].name, 'get_weather');
  assert.equal(r.toolCalls[0].arguments, '{"city":"Beijing"}');
});
