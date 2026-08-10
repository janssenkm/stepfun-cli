const test = require('node:test');
const assert = require('node:assert');
const { parseConfigFile } = require('../dist/config/schema.js');
const { isValidRegion, parseRegion, REGIONS } = require('../dist/config/regions.js');

test('parseConfigFile normalizes case-insensitive region names', () => {
  const f = parseConfigFile({ apiKey: 'k', region: 'cN', output: 'json', timeout: 30 });
  assert.equal(f.apiKey, 'k');
  assert.equal(f.region, 'CN');
  assert.equal(f.output, 'json');
  assert.equal(f.timeout, 30);
});

test('parseConfigFile accepts snake_case aliases', () => {
  const f = parseConfigFile({ api_key: 'k', default_text_model: 'm' });
  assert.equal(f.apiKey, 'k');
  assert.equal(f.defaultTextModel, 'm');
});

test('parseConfigFile rejects invalid region', () => {
  assert.equal(parseConfigFile({ region: 'bogus' }).region, undefined);
});

test('parseConfigFile rejects non-http base urls', () => {
  assert.equal(parseConfigFile({ genBaseUrl: 'ftp://x' }).genBaseUrl, undefined);
});

test('parseConfigFile ignores garbage', () => {
  assert.deepEqual(parseConfigFile('nope'), {});
  assert.deepEqual(parseConfigFile(null), {});
});

test('regions expose gen + api base', () => {
  assert.equal(REGIONS.Global.genBase, 'https://api.stepfun.ai/step_plan/v1');
  assert.equal(REGIONS.Global.apiBase, 'https://api.stepfun.ai/v1');
  assert.equal(REGIONS.CN.genBase, 'https://api.stepfun.com/step_plan/v1');
});

test('region parser accepts Global and CN case-insensitively', () => {
  assert.equal(isValidRegion('GLOBAL'), true);
  assert.equal(isValidRegion('cN'), true);
  assert.equal(isValidRegion('eu'), false);
  assert.equal(parseRegion('global'), 'Global');
  assert.equal(parseRegion('CN'), 'CN');
  assert.equal(parseConfigFile({ region: 'StepPlan-CN' }).region, 'CN');
});
