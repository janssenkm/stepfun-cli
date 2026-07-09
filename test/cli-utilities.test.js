const test = require('node:test');
const assert = require('node:assert/strict');
const {
  optionalInteger,
  optionalNumber,
  positiveNumber,
  requireExactlyOne
} = require('../dist/cli/validation');

class TestUsageError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

test('numeric validators reject partial, non-finite, and non-positive values', () => {
  assert.equal(optionalNumber('1.5', '--value', TestUsageError), 1.5);
  assert.equal(optionalInteger('-2', '--count', TestUsageError), -2);
  assert.equal(positiveNumber('3', '--timeout', TestUsageError), 3);
  assert.throws(() => optionalInteger('2x', '--count', TestUsageError), error =>
    /Invalid --count/.test(error.message) && /must be an integer/.test(error.hint));
  assert.throws(() => optionalNumber('Infinity', '--value', TestUsageError), error =>
    /Invalid --value/.test(error.message) && /must be a number/.test(error.hint));
  assert.throws(() => positiveNumber('0', '--timeout', TestUsageError), error =>
    /Invalid --timeout/.test(error.message) && /positive number/.test(error.hint));
});

test('exact-one validation returns the selected option and rejects other cardinalities', () => {
  assert.equal(requireExactlyOne({ file: 'a' }, ['file', 'url'], TestUsageError), 'file');
  assert.throws(() => requireExactlyOne({}, ['file', 'url'], TestUsageError), /exactly one/);
  assert.throws(() => requireExactlyOne({ file: 'a', url: 'b' }, ['file', 'url'], TestUsageError), /exactly one/);
});
