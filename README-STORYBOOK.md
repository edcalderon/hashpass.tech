# Storybook Documentation

This project uses Storybook for interactive component documentation.

## Quick Start

```bash
# Start Storybook development server
npm run storybook

# Build static documentation
npm run build-storybook

# Serve static build
npm run docs:serve
```

## Access

- Development: http://localhost:6006
- Static build: `storybook-static/` directory

## Integration

The `/docs` route includes a button to open Storybook (web only). Configure the URL via `EXPO_PUBLIC_STORYBOOK_URL` environment variable.

For detailed setup instructions, see [docs/storybook-setup.md](docs/storybook-setup.md).

