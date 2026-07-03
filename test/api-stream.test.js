const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { StepFunClient, extractAssistantText } = require('../dist/api.js');

test('extractAssistantText joins text content blocks and ignores non-text blocks', () => {
  const text = extractAssistantText({
    choices: [{ message: { content: [
      { type: 'reasoning', text: 'hidden' },
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' }
    ] } }]
  });
  assert.equal(text, 'Hello world');
});

test('chat stream accumulates text, reasoning, tool calls, finish reason, and usage', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': keep-alive\r\n\r\n');
    res.write('data: {"choices":[{"delta":{"reasoning_content":"think "}}]}\r\n\r\n');
    res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n');
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_","arguments":"{\\"q\\":"}}]}}]}\r\n\r\n');
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"weather","arguments":"\\"x\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"total_tokens":12}}\r\n\r\n');
    res.end('data: [DONE]\r\n\r\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const client = new StepFunClient('test-key', baseUrl, 5);
    let text = '';
    let reasoning = '';
    const result = await client.chatCompletionStream(
      'test-model',
      [{ role: 'user', content: 'hi' }],
      delta => { text += delta; },
      undefined,
      delta => { reasoning += delta; }
    );

    assert.equal(text, 'Hello');
    assert.equal(reasoning, 'think ');
    assert.equal(result.content, 'Hello');
    assert.equal(result.reasoningContent, 'think ');
    assert.equal(result.finishReason, 'tool_calls');
    assert.deepEqual(result.usage, { total_tokens: 12 });
    assert.deepEqual(result.toolCalls, [{
      id: 'call_1',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"q":"x"}' }
    }]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
