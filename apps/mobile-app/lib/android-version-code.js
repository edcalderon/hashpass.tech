const MAX_ANDROID_VERSION_CODE = 2147483647;

function parseAndroidVersionCode(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid Android version code: ${value}`);
  }

  if (parsed > MAX_ANDROID_VERSION_CODE) {
    throw new Error(
      `Android version code ${parsed} exceeds the Play Store limit of ${MAX_ANDROID_VERSION_CODE}.`,
    );
  }

  return parsed;
}

function computeAndroidVersionCode(now = Date.now()) {
  const minutesSinceEpoch = Math.floor(Number(now) / 60000);

  if (!Number.isInteger(minutesSinceEpoch) || minutesSinceEpoch <= 0) {
    throw new Error(`Unable to compute an Android version code from timestamp: ${now}`);
  }

  if (minutesSinceEpoch > MAX_ANDROID_VERSION_CODE) {
    throw new Error(
      `Computed Android version code ${minutesSinceEpoch} exceeds the Play Store limit of ${MAX_ANDROID_VERSION_CODE}.`,
    );
  }

  return minutesSinceEpoch;
}

function normalizeBackend(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveAndroidVersionCode({
  env = process.env,
  backend = env.MOBILE_RELEASE_BACKEND || env.EXPO_USE_LOCAL_VERSIONING,
  now = Date.now(),
} = {}) {
  const releaseBackend = normalizeBackend(backend);
  const shouldUseLocalVersioning = releaseBackend === 'fastlane' || releaseBackend === '1' || releaseBackend === 'true';

  if (!shouldUseLocalVersioning) {
    return null;
  }

  const explicitCandidates = [env.MOBILE_ANDROID_VERSION_CODE, env.ANDROID_VERSION_CODE];

  for (const candidate of explicitCandidates) {
    if (!candidate) {
      continue;
    }

    return parseAndroidVersionCode(candidate);
  }

  const ciCandidates = [
    env.GITHUB_RUN_NUMBER,
    env.CI_PIPELINE_IID,
    env.CI_RUN_NUMBER,
    env.BUILD_NUMBER,
    env.CI_BUILD_NUMBER,
  ];

  for (const candidate of ciCandidates) {
    if (!candidate) {
      continue;
    }

    try {
      return parseAndroidVersionCode(candidate);
    } catch (error) {
      // Fall back to the timestamp-based version code below.
    }
  }

  return computeAndroidVersionCode(now);
}

module.exports = {
  MAX_ANDROID_VERSION_CODE,
  parseAndroidVersionCode,
  computeAndroidVersionCode,
  resolveAndroidVersionCode,
};
