const test = require('node:test');
const assert = require('node:assert/strict');
const { isBrokenPipe } = require('../dist/cli/process.js');

test('broken pipe detection only accepts EPIPE', () => {
  assert.equal(isBrokenPipe({ code: 'EPIPE' }), true);
  assert.equal(isBrokenPipe({ code: 'ECONNRESET' }), false);
});
