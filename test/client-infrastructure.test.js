const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { ENDPOINTS, endpointUrl } = require('../dist/client/endpoints.js');
const { APIError, HttpClient } = require('../dist/client/http.js');
const { parseSSE } = require('../dist/client/sse.js');

test('endpoint helpers define canonical paths and normalize slashes', () => {
  assert.equal(ENDPOINTS.chatCompletions, '/chat/completions');
  assert.equal(endpointUrl('https://example.test/v1/', '/chat/completions'),
    'https://example.test/v1/chat/completions');
});

test('parseSSE handles split chunks, CRLF, comments, and multiline data', async () => {
  const encoder = new TextEncoder();
  const chunks = [': ping\r\nda', 'ta: first\r\ndata: second\r\n\r\ndata: final'];
  const response = new Response(new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    }
  }));

  const events = [];
  for await (const data of parseSSE(response)) events.push(data);
  assert.deepEqual(events, ['first\nsecond', 'final']);
});

test('HttpClient adds standard headers and maps non-2xx responses', async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req);
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(403);
    res.end('denied');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const client = new HttpClient('secret-key', `http://127.0.0.1:${server.address().port}/`, 5000);
    assert.deepEqual(await client.requestJson({ endpoint: '/ok' }), { ok: true });
    assert.equal(requests[0].headers.authorization, 'Bearer secret-key');
    assert.match(requests[0].headers['user-agent'], /^stepfun-cli\//);

    await assert.rejects(
      client.request({ endpoint: '/failure' }),
      error => error instanceof APIError && error.status === 403 && error.message.includes('denied')
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
