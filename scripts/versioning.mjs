const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RUN_NUMBER = /^(0|[1-9]\d*)$/;
const COMMIT_ID = /^[0-9a-z]+$/i;

export function parseStableVersion(version) {
  if (typeof version !== 'string') return null;
  const match = STABLE_VERSION.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function normalizeReleaseTag(rawTag) {
  if (!rawTag) {
    throw new Error(
      'Missing RELEASE_TAG environment variable (expected v1.2.3 or 1.2.3).',
    );
  }

  const version = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;
  if (!parseStableVersion(version)) {
    throw new Error(
      `RELEASE_TAG "${rawTag}" must be a stable semantic version such as v1.2.3.`,
    );
  }
  return version;
}

export function createNextVersion({ latest, runNumber, sha }) {
  if (!RUN_NUMBER.test(String(runNumber))) {
    throw new Error(`Invalid GitHub run number: "${runNumber}".`);
  }
  if (!COMMIT_ID.test(String(sha))) {
    throw new Error(`Invalid commit identifier: "${sha}".`);
  }

  const published = latest === null ? null : parseStableVersion(latest);
  if (latest !== null && !published) {
    throw new Error(`Invalid latest published version: "${latest}".`);
  }

  const base = published
    ? `${published.major}.${published.minor}.${published.patch + 1}`
    : '0.0.0';
  return `${base}-next.${runNumber}.${String(sha).slice(0, 7).toLowerCase()}`;
}
