const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'dist', 'index.js');

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stepfun-files-'));
}

function run(args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, HOME: options.home || home(), STEPFUN_API_KEY: '' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function server() {
  const requests = [];
  const instance = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const record = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      requests.push(record);
      res.setHeader('content-type', req.url.endsWith('/content') ? 'text/plain' : 'application/json');
      if (req.method === 'POST' && req.url === '/files') return res.end(JSON.stringify({ id: 'file-upload', object: 'file', purpose: 'storage', status: 'processed' }));
      if (req.method === 'GET' && req.url === '/files') return res.end(JSON.stringify({ object: 'list', data: [{ id: 'file-one', object: 'file', filename: 'one.png', bytes: 2048, purpose: 'storage', status: 'processed', created_at: 1 }] }));
      if (req.method === 'GET' && req.url === '/files/file-one') return res.end(JSON.stringify({ id: 'file-one', object: 'file', filename: 'one.png' }));
      if (req.method === 'GET' && req.url === '/files/file-one/content') return res.end('parsed text');
      if (req.method === 'DELETE' && req.url === '/files/file-one') return res.end(JSON.stringify({ id: 'file-one', object: 'file', deleted: true }));
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${instance.address().port}`,
    requests,
    close: () => new Promise(resolve => instance.close(resolve))
  };
}

test('file upload sends multipart local file and quiet prints its ID', async () => {
  const mock = await server();
  try {
    const dir = home();
    const input = path.join(dir, 'image.png');
    fs.writeFileSync(input, 'PNG');
    const result = await run(['--api-key', 'key', '--base-url', mock.url, '--region', 'Global', '--quiet', 'file', 'upload', '--file', input, '--purpose', 'storage'], { home: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'file-upload');
    assert.equal(mock.requests[0].method, 'POST');
    assert.match(mock.requests[0].headers['content-type'], /^multipart\/form-data/);
    assert.match(mock.requests[0].body, /name="purpose"[\s\S]*storage/);
    assert.match(mock.requests[0].body, /filename="image.png"/);
  } finally { await mock.close(); }
});

test('file list, get, content, and delete use StepFun paths and methods', async () => {
  const mock = await server();
  try {
    const common = ['--api-key', 'key', '--base-url', mock.url, '--region', 'CN', '--quiet'];
    assert.equal((await run([...common, '--output', 'json', 'file', 'list'])).status, 0);
    assert.equal((await run([...common, '--output', 'json', 'file', 'get', 'file-one'])).status, 0);
    const content = await run([...common, '--output', 'text', 'file', 'content', 'file-one']);
    assert.equal(content.stdout, 'parsed text\n');
    const deleted = await run([...common, 'file', 'delete', 'file-one', '--yes']);
    assert.equal(deleted.status, 0, deleted.stderr);
    assert.equal(deleted.stdout.trim(), 'deleted');
    assert.deepEqual(mock.requests.map(request => [request.method, request.url]), [
      ['GET', '/files'], ['GET', '/files/file-one'], ['GET', '/files/file-one/content'], ['DELETE', '/files/file-one']
    ]);
  } finally { await mock.close(); }
});

test('file validation and dry-run do not require authentication', async () => {
  const missing = await run(['file', 'upload', '--purpose', 'storage']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /exactly one of --file \/ --url/);

  const conflict = await run(['file', 'upload', '--file', 'x', '--url', 'https://example.com/x', '--purpose', 'storage']);
  assert.notEqual(conflict.status, 0);

  const dir = home();
  const unsupported = path.join(dir, 'archive.zip');
  fs.writeFileSync(unsupported, 'zip');
  const invalidType = await run(['file', 'upload', '--file', unsupported, '--purpose', 'storage'], { home: dir });
  assert.equal(invalidType.status, 2);
  assert.match(invalidType.stderr, /Unsupported file type/);

  const dry = await run(['--dry-run', '--output', 'json', 'file', 'get', 'file/a']);
  assert.equal(dry.status, 0, dry.stderr);
  const summary = JSON.parse(dry.stdout);
  assert.match(summary.url, /\/files\/file%2Fa$/);
});

test('file delete requires --yes in non-interactive mode', async () => {
  const result = await run(['--non-interactive', 'file', 'delete', 'file-one']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Re-run with --yes/);
});
