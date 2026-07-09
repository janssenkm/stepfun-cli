const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');
const { CLI_VERSION, USER_AGENT } = require('../dist/version.js');

test('CLI version and User-Agent are derived from package.json', () => {
  assert.equal(CLI_VERSION, packageJson.version);
  assert.equal(USER_AGENT, `stepfun-cli/${packageJson.version}`);
});
