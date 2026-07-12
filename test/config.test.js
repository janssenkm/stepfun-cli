const test = require('node:test');
const assert = require('node:assert');
const { parseConfigFile } = require('../dist/config/schema.js');
const { isValidRegion, REGIONS } = require('../dist/config/regions.js');

test('parseConfigFile accepts camelCase', () => {
  const f = parseConfigFile({ apiKey: 'k', region: 'StepPlan-CN', output: 'json', timeout: 30 });
  assert.equal(f.apiKey, 'k');
  assert.equal(f.region, 'StepPlan-CN');
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
  assert.equal(REGIONS['StepPlan-Global'].genBase, 'https://api.stepfun.ai/step_plan/v1');
  assert.equal(REGIONS['StepPlan-Global'].apiBase, 'https://api.stepfun.ai/v1');
  assert.equal(REGIONS['StepPlan-CN'].genBase, 'https://api.stepfun.com/step_plan/v1');
});

test('isValidRegion type guard', () => {
  assert.equal(isValidRegion('StepPlan-Global'), true);
  assert.equal(isValidRegion('StepPlan-CN'), true);
  assert.equal(isValidRegion('eu'), false);
});
