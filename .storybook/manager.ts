import { addons } from '@storybook/manager-api';
import { themes } from '@storybook/theming';

addons.setConfig({
  theme: {
    ...themes.light,
    brandTitle: 'HashPass Documentation',
    brandUrl: 'https://bsl2025.hashpass.tech',
    brandImage: undefined,
    brandTarget: '_self',
  },
});

