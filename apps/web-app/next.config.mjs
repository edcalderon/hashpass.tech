/** @type {import('next').NextConfig} */
const nextConfig = {
  // `dev:all` may run alongside a manually-started Club server. Giving the
  // orchestrated process its own build directory prevents Next's dev lock
  // from making the alternate local port unusable.
  distDir: process.env.HASHPASS_CLUB_NEXT_DIST_DIR || '.next',
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  transpilePackages: ['@hashpass/ui', '@hashpass/utils', '@hashpass/types', '@hashpass/i18n'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
    };

    return config;
  },
};

export default nextConfig;
