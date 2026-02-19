import { StorybookConfig } from '@storybook/react-webpack5';

// In production, only show guides (docs stories), not component stories
const isProduction = process.env.NODE_ENV === 'production';
const stories = isProduction
  ? [
      // Only guides in production
      '../docs/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    ]
  : [
      // All stories in development
      '../components/**/*.stories.@(js|jsx|ts|tsx|mdx)',
      '../docs/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    ];

const config: StorybookConfig = {
  stories,
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-links',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  // Configure base path for static deployment
  // This allows Storybook to work when served from /storybook/ subdirectory
  staticDirs: ['../.storybook/static'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
  webpackFinal: async (config) => {
    // Add support for React Native Web
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
      'react-native-svg': 'react-native-svg-web',
      '@': require('path').resolve(__dirname, '..'),
    };

    // Add support for Expo
    config.resolve.extensions = [
      ...(config.resolve.extensions || []),
      '.web.js',
      '.web.jsx',
      '.web.ts',
      '.web.tsx',
      '.mjs',
      '.cjs',
    ];

    // Handle CSS and other assets
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    
    // Find and modify existing CSS rule or add new one with PostCSS and Tailwind support
    const cssRuleIndex = config.module.rules.findIndex((rule: any) => 
      rule && rule.test && rule.test.toString().includes('css')
    );
    
    const cssRule = {
      test: /\.css$/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1,
          },
        },
        {
          loader: 'postcss-loader',
          options: {
            postcssOptions: {
              plugins: [
                require('tailwindcss'),
                require('autoprefixer'),
              ],
            },
          },
        },
      ],
      exclude: /node_modules/,
    };
    
    if (cssRuleIndex !== -1) {
      config.module.rules[cssRuleIndex] = cssRule;
    } else {
      config.module.rules.push(cssRule);
    }

    // Override TypeScript rule to use ts-loader with proper config
    const tsRuleIndex = config.module.rules.findIndex((rule: any) => 
      rule && rule.test && rule.test.toString().includes('tsx?')
    );
    
    if (tsRuleIndex !== -1) {
      const path = require('path');
      config.module.rules[tsRuleIndex] = {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.resolve(__dirname, '../tsconfig.json'),
              compilerOptions: {
                jsx: 'react',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true,
              },
            },
          },
        ],
        exclude: /node_modules/,
      };
    } else {
      // Add ts-loader rule if it doesn't exist
      const path = require('path');
      config.module.rules.push({
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.resolve(__dirname, '../tsconfig.json'),
              compilerOptions: {
                jsx: 'react',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true,
              },
            },
          },
        ],
        exclude: /node_modules/,
      });
    }

    // Ignore node_modules for certain packages that don't work in Storybook
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    // Configure public path for subdirectory deployment
    // Storybook needs publicPath to be relative or absolute path without trailing slash
    // The base path is handled by the server routing, not webpack publicPath
    // For subdirectory deployment, we should NOT set publicPath here
    // Instead, Storybook's build will generate relative paths that work from any subdirectory
    // Only set publicPath if explicitly needed (usually not for static deployments)

    return config;
  },
};

export default config;

