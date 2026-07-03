const test = require('node:test');
const assert = require('node:assert/strict');

const { runUpdate } = require('../dist/update.js');

test('update prints the current version and explicit npm update command', () => {
  let output = '';
  const exitCode = runUpdate({
    currentVersion: '1.2.3',
    standalone: false,
    write: message => { output += message; }
  });

  assert.equal(exitCode, 0);
  assert.equal(output, [
    'Current version: 1.2.3',
    '',
    'Run:',
    '  npm update -g @stepfun-ai/cli',
    '',
    ''
  ].join('\n'));
});

test('standalone update points users to Releases instead of npm', () => {
  let output = '';
  const exitCode = runUpdate({
    currentVersion: '1.2.3',
    standalone: true,
    write: message => { output += message; }
  });

  assert.equal(exitCode, 0);
  assert.match(output, /Current version: 1\.2\.3/);
  assert.match(output, /standalone binary/);
  assert.match(output, /Releases/);
  assert.doesNotMatch(output, /npm update/);
});
