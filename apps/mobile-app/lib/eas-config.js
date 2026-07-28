const PRODUCTION_PROFILE = 'production';
const PRODUCTION_OWNER = 'hashpasss-team';
const DEVELOPMENT_OWNER = 'hashpasstechs-team';
const PRODUCTION_SLUG = 'hashpasstech';
const DEVELOPMENT_SLUG = 'hash-pass-tech';
// EAS Update channel, keyed to the API backend baked into the JS bundle
// (see the "Native Android App Environment" note in CLAUDE.md) -- NOT to the
// Play track. internal/alpha/beta all run environment=development and must
// only ever receive OTA updates published to the "development" channel;
// only environment=production binaries (track=production) subscribe to
// "production". Crossing these would silently repoint one environment's
// installed base at the other's JS bundle without a store review to catch it.
const PRODUCTION_CHANNEL = 'production';
const DEVELOPMENT_CHANNEL = 'development';
const { resolveAndroidVersionCode } = require('./android-version-code');

function normalizeProfile(profile) {
  return String(profile || '').trim().toLowerCase();
}

function resolveProjectId({ env = process.env, profile, baseProjectId = null } = {}) {
  const selectedProfile = normalizeProfile(profile || env.EAS_BUILD_PROFILE || env.EXPO_PUBLIC_EAS_BUILD_PROFILE);
  const isProduction = !selectedProfile || selectedProfile === PRODUCTION_PROFILE;

  if (!isProduction) {
    const candidates = [
      env.EAS_PROJECT_ID_DEV,
      env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV,
      env.EAS_PROJECT_ID,
      env.EXPO_PUBLIC_EAS_PROJECT_ID,
      baseProjectId,
    ];

    return candidates.find(Boolean) || null;
  }

  const candidates = [env.EAS_PROJECT_ID, env.EXPO_PUBLIC_EAS_PROJECT_ID, baseProjectId];
  return candidates.find(Boolean) || null;
}

function resolveOwner({ env = process.env, profile, baseOwner = null } = {}) {
  const selectedProfile = normalizeProfile(profile || env.EAS_BUILD_PROFILE || env.EXPO_PUBLIC_EAS_BUILD_PROFILE);

  if (!selectedProfile || selectedProfile === PRODUCTION_PROFILE) {
    return env.EXPO_OWNER || PRODUCTION_OWNER;
  }

  return env.EXPO_OWNER_DEV || baseOwner || DEVELOPMENT_OWNER;
}

function resolveSlug({ env = process.env, profile, baseSlug = null } = {}) {
  const selectedProfile = normalizeProfile(profile || env.EAS_BUILD_PROFILE || env.EXPO_PUBLIC_EAS_BUILD_PROFILE);

  if (!selectedProfile || selectedProfile === PRODUCTION_PROFILE) {
    return env.EXPO_SLUG || PRODUCTION_SLUG;
  }

  return env.EXPO_SLUG_DEV || baseSlug || DEVELOPMENT_SLUG;
}

function resolveUpdateChannel({ env = process.env, profile } = {}) {
  const selectedProfile = normalizeProfile(profile || env.EAS_BUILD_PROFILE || env.EXPO_PUBLIC_EAS_BUILD_PROFILE);

  if (env.EAS_UPDATE_CHANNEL) {
    return env.EAS_UPDATE_CHANNEL;
  }

  return !selectedProfile || selectedProfile === PRODUCTION_PROFILE ? PRODUCTION_CHANNEL : DEVELOPMENT_CHANNEL;
}

function buildExpoConfig({ baseConfig = {}, env = process.env } = {}) {
  const owner = resolveOwner({
    env,
    baseOwner: baseConfig.owner || null,
  });
  const slug = resolveSlug({
    env,
    baseSlug: baseConfig.slug || null,
  });
  const projectId = resolveProjectId({
    env,
    baseProjectId: baseConfig.extra?.eas?.projectId || null,
  });
  const updateChannel = resolveUpdateChannel({ env });
  const androidVersionCode = resolveAndroidVersionCode({ env });
  const android = {
    ...(baseConfig.android || {}),
    ...(androidVersionCode
      ? {
          versionCode: androidVersionCode,
        }
      : {}),
  };
  const publicExtras = {
    EXPO_PUBLIC_API_BASE_URL: env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_FRONTEND_URL: env.EXPO_PUBLIC_FRONTEND_URL,
    EXPO_PUBLIC_SITE_URL: env.EXPO_PUBLIC_SITE_URL,
    EXPO_PUBLIC_ROUTER_ORIGIN: env.EXPO_PUBLIC_ROUTER_ORIGIN,
    EXPO_PUBLIC_ROUTER_HEAD_ORIGIN: env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN,
    EXPO_PUBLIC_EAS_BUILD_PROFILE: env.EXPO_PUBLIC_EAS_BUILD_PROFILE || env.EAS_BUILD_PROFILE,
    EXPO_PUBLIC_SUPABASE_PROFILE: env.EXPO_PUBLIC_SUPABASE_PROFILE,
    EXPO_PUBLIC_SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };

  const routerOrigin = env.EXPO_PUBLIC_ROUTER_ORIGIN || '';
  const routerHeadOrigin = env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN || routerOrigin;
  const routerConfig = {
    ...(routerOrigin ? { origin: routerOrigin } : {}),
    ...(routerHeadOrigin ? { headOrigin: routerHeadOrigin } : {}),
  };

  return {
    ...baseConfig,
    ...(slug ? { slug } : {}),
    ...(owner ? { owner } : {}),
    ...(Object.keys(android).length ? { android } : {}),
    ...(projectId
      ? {
          updates: {
            ...(baseConfig.updates || {}),
            url: `https://u.expo.dev/${projectId}`,
            // Fastlane builds this app via `expo prebuild` + local Gradle, not
            // `eas build` -- EAS Build normally bakes the channel in for you,
            // but a non-EAS-Build pipeline has to set it explicitly here so
            // expo-updates' config plugin writes it into AndroidManifest.xml
            // at prebuild time. See resolveUpdateChannel() above for why this
            // tracks environment (api-dev vs api prod), not Play track.
            requestHeaders: {
              ...(baseConfig.updates?.requestHeaders || {}),
              'expo-channel-name': updateChannel,
            },
          },
        }
      : {}),
    extra: {
      ...(baseConfig.extra || {}),
      ...(Object.keys(routerConfig).length ? { router: routerConfig } : {}),
      ...Object.fromEntries(
        Object.entries(publicExtras).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      ),
      eas: {
        ...((baseConfig.extra && baseConfig.extra.eas) || {}),
        ...(projectId ? { projectId } : {}),
      },
    },
  };
}

module.exports = {
  PRODUCTION_PROFILE,
  PRODUCTION_CHANNEL,
  DEVELOPMENT_CHANNEL,
  normalizeProfile,
  resolveProjectId,
  resolveOwner,
  resolveSlug,
  resolveUpdateChannel,
  buildExpoConfig,
};
