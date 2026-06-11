# Storybook Documentation

This project uses Storybook for interactive component documentation. The Docusaurus site in `apps/docs/` is now the primary documentation surface.

## Quick Start

```bash
npm run storybook
npm run build-storybook
npm run storybook:serve
```

## Access

- Development: http://localhost:6006
- Static build: `storybook-static/` directory

## Integration

The app's docs surface can include a button to open Storybook (web only). Configure the URL via the `EXPO_PUBLIC_STORYBOOK_URL` environment variable.

For detailed setup instructions, see [storybook-setup.md](storybook-setup.md).
