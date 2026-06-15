const PRODUCTION_PROFILE = 'production';

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
  void profile;
  return env.EXPO_OWNER || baseOwner || 'hashpasstechs-team';
}

function buildExpoConfig({ baseConfig = {}, env = process.env } = {}) {
  const owner = resolveOwner({
    env,
    baseOwner: baseConfig.owner || null,
  });
  const projectId = resolveProjectId({
    env,
    baseProjectId: baseConfig.extra?.eas?.projectId || null,
  });

  return {
    ...baseConfig,
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
  buildExpoConfig,
};
