const test = require('node:test');
const assert = require('node:assert');
const { registry } = require('../dist/registry.js');

test('resolves two-word commands', () => {
  assert.equal(registry.resolve(['text', 'chat']).command.name, 'text chat');
  assert.equal(registry.resolve(['file', 'upload']).command.name, 'file upload');
  assert.equal(registry.resolve(['account', 'show']).command.name, 'account show');
});

test('resolves one-word groups', () => {
  assert.equal(registry.resolve(['models', 'list']).command.name, 'models list');
  assert.equal(registry.resolve(['token', 'count']).command.name, 'token count');
});

test('passes positional args through as extra', () => {
  const { command, extra } = registry.resolve(['models', 'get', 'step-3.7-flash']);
  assert.equal(command.name, 'models get');
  assert.deepEqual(extra, ['step-3.7-flash']);
});

test('unknown command throws', () => {
  assert.throws(() => registry.resolve(['frobnicate']));
});

test('every registered command has the required fields', () => {
  for (const cmd of registry.getAllCommands()) {
    assert.ok(cmd.name, 'name');
    assert.ok(cmd.description, `description for ${cmd.name}`);
    assert.equal(typeof cmd.execute, 'function', `execute for ${cmd.name}`);
  }
});
