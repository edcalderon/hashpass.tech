import { addons } from '@storybook/manager-api';
import { themes } from '@storybook/theming';

addons.setConfig({
  theme: {
    ...themes.light,
    brandTitle: 'HASHPASS',
    brandUrl: 'https://hashpass.tech',
    brandImage: undefined,
    brandTarget: '_self',
  },
});
