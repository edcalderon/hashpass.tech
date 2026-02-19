# Storybook Documentation Setup

This project uses [Storybook](https://storybook.js.org/) for interactive component documentation that works seamlessly with Expo Web.

## Features

- ✅ Professional documentation solution
- ✅ Works seamlessly with Expo Web
- ✅ Interactive component demos
- ✅ Can export as static site
- ✅ TypeScript support
- ✅ React Native Web compatibility

## Getting Started

### Development

Start the Storybook development server:

```bash
npm run storybook
```

This will start Storybook on `http://localhost:6006`

### Build Static Site

Build a static version of Storybook for deployment:

```bash
npm run build-storybook
```

The static files will be generated in the `storybook-static` directory.

### Serve Static Build

Serve the static build locally:

```bash
npm run docs:serve
```

## Configuration

Storybook is configured in `.storybook/`:

- `main.ts` - Main configuration file
- `preview.tsx` - Global decorators and parameters
- `manager.ts` - UI theme and branding

## Writing Stories

Stories are located alongside components:

```
components/
  Button.tsx
  Button.stories.tsx
```

Example story:

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
  },
};
```

## Integration with App

The `/docs` route includes a button to open Storybook (web only). The URL can be configured via `EXPO_PUBLIC_STORYBOOK_URL` environment variable.

## Deployment

### Static Export

1. Build Storybook: `npm run build-storybook`
2. Deploy the `storybook-static` directory to your hosting service
3. Configure the `EXPO_PUBLIC_STORYBOOK_URL` to point to the deployed Storybook

### Netlify

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/storybook/*"
  to = "/storybook/index.html"
  status = 200
```

### AWS Amplify

Configure build settings to build and deploy Storybook alongside the main app.

## Troubleshooting

### React Native Web Compatibility

Storybook is configured to handle React Native Web components via webpack aliases in `.storybook/main.ts`.

### CSS Issues

Global CSS is imported in `.storybook/preview.tsx`. Ensure all necessary stylesheets are imported there.

## Resources

- [Storybook Documentation](https://storybook.js.org/docs)
- [Storybook for React](https://storybook.js.org/docs/react/get-started/introduction)
- [Expo Web](https://docs.expo.dev/workflow/web/)

