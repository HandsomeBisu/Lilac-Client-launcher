const test = require('node:test');
const assert = require('node:assert/strict');
const { versions, normalize, defaults } = require('../src/model.js');

test('user support matrix: 19 unique versions; only two legacy versions use Forge', () => {
  assert.equal(versions.length, 19);
  assert.equal(new Set(versions.map(item => item.version)).size, 19);
  assert.deepEqual(versions.filter(item => item.loader === 'Forge').map(item => item.version), ['1.8.9','1.12.2']);
  assert.equal(versions.filter(item => item.loader === 'Fabric').length, 17);
});
test('persisted preferences survive normalization', () => {
  const value = { schemaVersion: 1, version: '1.8.9', favorites: ['1.12.2', '26.3'], memory: 8, resolution: '1920x1080', motion: false };
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(value))), value);
});
test('corrupt, unsupported or out-of-range preferences recover safely', () => {
  for (const value of [null, false, 'broken', [], {schemaVersion: 7}]) assert.deepEqual(normalize(value), defaults());
  assert.deepEqual(normalize({schemaVersion: 1, version: '<script>', favorites: ['1.8.9','1.8.9',null,'bad'], memory: 999, resolution: 'bad', motion: 'yes'}), {...defaults(), favorites: ['1.8.9']});
});
