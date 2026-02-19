import { Preview } from '@storybook/react';
import React from 'react';
// Note: global.css uses Tailwind which needs additional webpack config
// For now, components should work without it in Storybook
// import '../app/global.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#000000',
        },
        {
          name: 'gray',
          value: '#f2f2f7',
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;

