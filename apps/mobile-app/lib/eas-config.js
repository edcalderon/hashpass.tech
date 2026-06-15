const PRODUCTION_PROFILE = 'production';
const PRODUCTION_OWNER = 'hashpasss-team';
const DEVELOPMENT_OWNER = 'hashpasstechs-team';
const PRODUCTION_SLUG = 'hashpasstech';
const DEVELOPMENT_SLUG = 'hash-pass-tech';

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

  return {
    ...baseConfig,
    ...(slug ? { slug } : {}),
    ...(owner ? { owner } : {}),
    extra: {
      ...(baseConfig.extra || {}),
      eas: {
        ...((baseConfig.extra && baseConfig.extra.eas) || {}),
        ...(projectId ? { projectId } : {}),
      },
    },
  };
}

module.exports = {
  PRODUCTION_PROFILE,
  normalizeProfile,
  resolveProjectId,
  resolveOwner,
  resolveSlug,
  buildExpoConfig,
};
