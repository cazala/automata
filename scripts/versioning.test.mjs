import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNextVersion,
  normalizeReleaseTag,
  parseStableVersion,
} from './versioning.mjs';

test('parses stable semantic versions', () => {
  assert.deepEqual(parseStableVersion('1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
  });
  assert.equal(parseStableVersion('1.2.3-beta.1'), null);
  assert.equal(parseStableVersion('01.2.3'), null);
});

test('normalizes stable GitHub release tags', () => {
  assert.equal(normalizeReleaseTag('v1.2.3'), '1.2.3');
  assert.equal(normalizeReleaseTag('1.2.3'), '1.2.3');
  assert.throws(() => normalizeReleaseTag('v1.2.3-beta.1'), /stable semantic/);
  assert.throws(() => normalizeReleaseTag(undefined), /Missing RELEASE_TAG/);
});

test('creates a first prerelease version when the package is unpublished', () => {
  assert.equal(
    createNextVersion({ latest: null, runNumber: '42', sha: 'ABCDEF1234' }),
    '0.0.0-next.42.abcdef1',
  );
});

test('patch-bumps the latest stable version for the next channel', () => {
  assert.equal(
    createNextVersion({ latest: '2.4.9', runNumber: '108', sha: '0123abc' }),
    '2.4.10-next.108.0123abc',
  );
});

test('rejects invalid workflow metadata and registry versions', () => {
  assert.throws(
    () => createNextVersion({ latest: 'next', runNumber: '1', sha: 'abcdef0' }),
    /Invalid latest published version/,
  );
  assert.throws(
    () => createNextVersion({ latest: null, runNumber: '01', sha: 'abcdef0' }),
    /Invalid GitHub run number/,
  );
  assert.throws(
    () => createNextVersion({ latest: null, runNumber: '1', sha: 'bad sha' }),
    /Invalid commit identifier/,
  );
});
