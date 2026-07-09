const test = require('node:test');
const assert = require('node:assert/strict');
const { detectAndCacheRegion, detectRegion } = require('../dist/config/detect-region');

const profiles = {
  'StepPlan-Global': { baseUrl: 'https://global.test/v1' },
  'StepPlan-CN': { baseUrl: 'https://cn.test/v1' }
};

test('region detection probes both endpoints and both authentication styles', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, headers: init.headers });
    const isCnXApiKey = url.startsWith('https://cn.test/') && init.headers['x-api-key'] === 'key';
    return new Response('{}', { status: isCnXApiKey ? 200 : 401 });
  };
  const region = await detectRegion('key', { fetchImpl, profiles, timeoutMs: 50 });
  assert.equal(region, 'StepPlan-CN');
  assert.ok(requests.some(request => request.url === 'https://global.test/v1/models' && request.headers.Authorization === 'Bearer key'));
  assert.ok(requests.some(request => request.url === 'https://global.test/v1/models' && request.headers['x-api-key'] === 'key'));
  assert.ok(requests.some(request => request.url === 'https://cn.test/v1/models' && request.headers.Authorization === 'Bearer key'));
  assert.ok(requests.some(request => request.url === 'https://cn.test/v1/models' && request.headers['x-api-key'] === 'key'));
});

test('region detection prefers Global when both regions validate', async () => {
  const region = await detectRegion('key', {
    profiles,
    timeoutMs: 50,
    fetchImpl: async () => new Response('{}', { status: 200 })
  });
  assert.equal(region, 'StepPlan-Global');
});

test('region detection falls back to Global when every probe fails', async () => {
  const region = await detectRegion('key', {
    profiles,
    timeoutMs: 50,
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(region, 'StepPlan-Global');
});

test('region detection caches the canonical detected result', async () => {
  let cached;
  const region = await detectAndCacheRegion('key', value => { cached = value; }, {
    profiles,
    timeoutMs: 50,
    fetchImpl: async url => new Response('{}', { status: url.startsWith('https://cn.test/') ? 200 : 401 })
  });
  assert.equal(region, 'StepPlan-CN');
  assert.equal(cached, 'StepPlan-CN');
});
