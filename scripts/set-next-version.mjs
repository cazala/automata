import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createNextVersion, parseStableVersion } from './versioning.mjs';

const root = process.cwd();
const corePkgPath = path.join(root, 'packages', 'core', 'package.json');
const pkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));

// The repo version is a permanent "0.0.0-development" placeholder; the base
// for prerelease builds is the latest published release, patch-bumped so
// X.Y.(Z+1)-next.* sorts above the release it follows.
function latestPublished(name) {
  try {
    const out = execFileSync('npm', ['view', name, 'version', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
    const version = JSON.parse(out);
    return typeof version === 'string' && parseStableVersion(version)
      ? version
      : null;
  } catch {
    return null; // not published yet (or offline)
  }
}

const latest = latestPublished(pkg.name);
const runNumber = process.env.GITHUB_RUN_NUMBER ?? '0';
const sha = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);
const nextVersion = createNextVersion({ latest, runNumber, sha });

pkg.version = nextVersion;
fs.writeFileSync(corePkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(`${pkg.name} version set to ${nextVersion}`);
