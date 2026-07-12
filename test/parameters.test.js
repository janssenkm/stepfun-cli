const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { saveImage } = require('../dist/commands/image/_save.js');

const BIN = path.resolve(__dirname, '../dist/index.js');
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-params-home-'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-params-'));

function run(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, HOME: TMP_HOME, STEPFUN_API_KEY: '' },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function dry(args) {
  const r = run([...args, '--dry-run', '--output', 'json']);
  assert.equal(r.code, 0, r.stderr);
  return JSON.parse(r.stdout).request;
}

for (const c of [
  { name: 'unknown option', args: ['text', 'chat', '--message', 'hi', '--modle', 'x'], error: /Unknown flag --modle/ },
  { name: 'missing option value before boolean', args: ['text', 'chat', '--message', 'hi', '--model', '--stream'], error: /--model requires a value/ },
  { name: 'non-numeric option', args: ['image', 'generate', '--prompt', 'x', '--steps', 'many'], error: /numeric value/ },
  { name: 'messages rejects zero max tokens', args: ['text', 'messages', '--message', 'hi', '--max-tokens', '0', '--dry-run'], error: /max-tokens must be > 0/ },
  { name: 'messages rejects negative max tokens', args: ['text', 'messages', '--message', 'hi', '--max-tokens', '-1', '--dry-run'], error: /max-tokens must be > 0/ },
  { name: 'chat requires a message', args: ['text', 'chat', '--dry-run'], error: /No messages/ },
  { name: 'image generation requires prompt', args: ['image', 'generate', '--dry-run'], error: /--prompt is required/ },
  { name: 'file upload requires one source', args: ['file', 'upload', '--dry-run'], error: /Either --file or --url is required/ },
  { name: 'file upload rejects two sources', args: ['file', 'upload', '--file', 'x', '--url', 'https://example.com/x', '--dry-run'], error: /not both/ },
  { name: 'responses rejects invalid schema JSON', args: ['text', 'responses', '--input', 'x', '--json-schema', path.join(TMP, 'bad.json'), '--dry-run'], error: /not valid JSON/ },
  { name: 'messages rejects invalid tool JSON', args: ['text', 'messages', '--message', 'hi', '--tool', '{bad', '--dry-run'], error: /not valid JSON/ },
  { name: 'boolean rejects an assigned value', args: ['text', 'chat', '--message', 'hi', '--stream=false', '--dry-run'], error: /does not take a value/ },
  { name: 'chat rejects temperature above range', args: ['text', 'chat', '--message', 'hi', '--temperature', '2.1', '--dry-run'], error: /between 0 and 2/ },
  { name: 'chat rejects fractional choice count', args: ['text', 'chat', '--message', 'hi', '--n', '1.5', '--dry-run'], error: /must be an integer/ },
  { name: 'chat rejects invalid response format', args: ['text', 'chat', '--message', 'hi', '--response-format', 'xml', '--dry-run'], error: /must be one of/ },
  { name: 'messages rejects invalid effort', args: ['text', 'messages', '--message', 'hi', '--effort', 'extreme', '--dry-run'], error: /--effort must be one of/ },
  { name: 'responses rejects ambiguous inputs', args: ['text', 'responses', '--input', 'one', '--message', 'two', '--dry-run'], error: /not both/ },
  { name: 'responses rejects unsupported tool choice', args: ['text', 'responses', '--input', 'x', '--tool-choice', 'required', '--dry-run'], error: /--tool-choice must be one of/ },
  { name: 'image rejects zero steps', args: ['image', 'generate', '--prompt', 'x', '--steps', '0', '--dry-run'], error: /between 1 and 50/ },
  { name: 'image rejects fractional steps', args: ['image', 'generate', '--prompt', 'x', '--steps', '1.5', '--dry-run'], error: /must be an integer/ },
  { name: 'image rejects unsupported response format', args: ['image', 'generate', '--prompt', 'x', '--response-format', 'bytes', '--dry-run'], error: /must be one of/ },
  { name: 'image rejects competing output destinations', args: ['image', 'generate', '--prompt', 'x', '--out', 'a.png', '--out-dir', 'out', '--dry-run'], error: /not both/ },
  { name: 'speech rejects competing text sources', args: ['speech', 'synthesize', '--text', 'x', '--text-file', 'x.txt', '--dry-run'], error: /not both/ },
  { name: 'speech rejects speed below range', args: ['speech', 'synthesize', '--text', 'x', '--speed', '0.49', '--dry-run'], error: /between 0.5 and 2/ },
  { name: 'speech rejects unsupported sample rate', args: ['speech', 'synthesize', '--text', 'x', '--sample-rate', '44100', '--dry-run'], error: /sample-rate must be one of/ },
  { name: 'speech rejects unsupported format', args: ['speech', 'synthesize', '--text', 'x', '--format', 'aac', '--dry-run'], error: /--format must be one of/ },
  { name: 'global timeout rejects zero', args: ['text', 'chat', '--message', 'hi', '--timeout', '0', '--dry-run'], error: /timeout must be a positive number/ },
  { name: 'file list rejects zero limit', args: ['file', 'list', '--limit', '0', '--dry-run'], error: /--limit must be between/ },
  { name: 'file list rejects fractional limit', args: ['file', 'list', '--limit', '1.5', '--dry-run'], error: /--limit must be an integer/ },
  { name: 'file list rejects invalid order', args: ['file', 'list', '--order', 'newest', '--dry-run'], error: /--order must be one of/ },
  { name: 'file list rejects competing cursors', args: ['file', 'list', '--before', 'a', '--after', 'b', '--dry-run'], error: /not both/ },
  { name: 'ASR rejects unknown explicit format', args: ['speech', 'recognize', '--file', path.join(TMP, 'audio.wav'), '--format-type', 'aac', '--dry-run'], error: /--format-type must be one of/ },
  { name: 'ASR rejects zero channel', args: ['speech', 'recognize', '--file', path.join(TMP, 'audio.wav'), '--channel', '0', '--dry-run'], error: /--channel must be between/ },
]) {
  test(`parameter error: ${c.name}`, () => {
    if (c.name === 'responses rejects invalid schema JSON') fs.writeFileSync(c.args[5], '{bad');
    if (c.name.startsWith('ASR rejects')) fs.writeFileSync(c.args[3], Buffer.from([0, 0]));
    const r = run(c.args);
    assert.equal(r.code, 2, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, c.error);
  });
}

test('chat maps repeated and structured flags to the API body', () => {
  const req = dry([
    'text', 'chat', '--model', 'm', '--message', 'system:from-message', '--message', 'user:hello',
    '--system', 'top-system', '--max-tokens', '64', '--temperature', '0', '--top-p', '0.9',
    '--n', '2', '--stop', 'END', '--frequency-penalty', '0.5', '--response-format', 'json_object',
    '--reasoning-effort', 'high', '--reasoning-format', 'general',
    '--tool', '{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}',
  ]);
  assert.equal(req.path, '/chat/completions');
  assert.deepEqual(req.body.messages, [
    { role: 'system', content: 'top-system' },
    { role: 'system', content: 'from-message' },
    { role: 'user', content: 'hello' },
  ]);
  assert.equal(req.body.temperature, 0);
  assert.equal(req.body.max_tokens, 64);
  assert.equal(req.body.top_p, 0.9);
  assert.equal(req.body.n, 2);
  assert.deepEqual(req.body.response_format, { type: 'json_object' });
  assert.equal(req.body.tools[0].function.name, 'lookup');
});

test('messages maps repeated stops, effort, and sampling flags', () => {
  const req = dry([
    'text', 'messages', '--message', 'hi', '--max-tokens', '1', '--temperature', '0',
    '--top-p', '1', '--top-k', '1', '--stop-sequence', 'A', '--stop-sequence', 'B', '--effort', 'low',
  ]);
  assert.deepEqual(req.body.stop_sequences, ['A', 'B']);
  assert.deepEqual(req.body.output_config, { effort: 'low' });
  assert.equal(req.body.max_tokens, 1);
  assert.equal(req.body.temperature, 0);
});

test('responses maps input and structured-output options', () => {
  const schema = path.join(TMP, 'answer.schema.json');
  fs.writeFileSync(schema, JSON.stringify({ type: 'object', properties: { answer: { type: 'string' } } }));
  const req = dry([
    'text', 'responses', '--input', 'hello', '--instructions', 'brief',
    '--effort', 'medium', '--max-output-tokens', '32', '--temperature', '0', '--tool-choice', 'auto',
    '--json-schema', schema,
  ]);
  assert.equal(req.body.input, 'hello');
  assert.equal(req.body.instructions, 'brief');
  assert.deepEqual(req.body.reasoning, { effort: 'medium' });
  assert.equal(req.body.text.format.type, 'json_schema');
  assert.equal(req.body.text.format.name, 'answer.schema');
  assert.equal(req.body.text.format.strict, true);
});

test('image generation preserves zero-valued numeric flags and booleans', () => {
  const req = dry([
    'image', 'generate', '--prompt', 'x', '--seed', '0', '--steps', '1', '--cfg-scale', '1',
    '--n', '1', '--text-mode', '--response-format', 'url',
  ]);
  assert.equal(req.body.seed, 0);
  assert.equal(req.body.steps, 1);
  assert.equal(req.body.cfg_scale, 1);
  assert.equal(req.body.text_mode, true);
  assert.equal(req.body.response_format, 'url');
});

test('PCM recognition requires the complete format tuple', () => {
  const audio = path.join(TMP, 'audio.pcm');
  fs.writeFileSync(audio, Buffer.from([0, 0]));
  const missing = run(['speech', 'recognize', '--file', audio, '--rate', '16000', '--bits', '16', '--dry-run']);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /requires --rate, --bits, --channel/);

  const req = dry(['speech', 'recognize', '--file', audio, '--rate', '16000', '--bits', '16', '--channel', '1']);
  assert.equal(req.path, '/audio/asr/sse');
  assert.deepEqual(req.request, { file: audio, model: 'stepaudio-2.5-asr', format: 'pcm' });
});

test('multi-image --out suffix stays in a dotted parent directory', async () => {
  const dir = path.join(TMP, 'results.v2');
  const out = path.join(dir, 'image');
  const saved = await saveImage({ b64_json: Buffer.from('image-2').toString('base64') }, 1, { out });
  assert.equal(saved, path.join(dir, 'image-2'));
  assert.equal(fs.readFileSync(saved, 'utf-8'), 'image-2');
});
