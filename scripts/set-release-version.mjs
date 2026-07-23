import fs from 'node:fs';
import path from 'node:path';
import { normalizeReleaseTag } from './versioning.mjs';

const root = process.cwd();
const corePkgPath = path.join(root, 'packages', 'core', 'package.json');

const rawTag = process.env.RELEASE_TAG;
let version;
try {
  version = normalizeReleaseTag(rawTag);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(corePkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(`@cazala/automata version set to ${version}`);
