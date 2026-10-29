/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@hashpass/ui', '@hashpass/utils', '@hashpass/types', '@hashpass/i18n', '@hashpass/config'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
    };

    return config;
  },
};

export default nextConfig;
