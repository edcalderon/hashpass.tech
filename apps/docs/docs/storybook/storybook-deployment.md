# Storybook Static Site Deployment

Storybook can be exported as a static site for deployment, perfect for hosting interactive documentation guides.

## Build Static Site

```bash
npm run build-storybook
```

This creates a `storybook-static/` directory with all the static files ready for deployment.

## Deployment Options

### Netlify

1. Build Storybook: `npm run build-storybook`
2. Deploy the `storybook-static` directory:

```bash
netlify deploy --prod --dir=storybook-static
```

Or add to `netlify.toml`:

```toml
[build]
  command = "npm run build-storybook"
  publish = "storybook-static"
```

### S3 + CloudFront or Another Static Host

1. Build Storybook: `npm run build-storybook`
2. Upload `storybook-static/` to S3 bucket
3. Configure S3 bucket for static website hosting
4. Set `EXPO_PUBLIC_STORYBOOK_URL` to the S3 URL

### GitHub Pages

1. Build Storybook: `npm run build-storybook`
2. Publish the `storybook-static/` directory from the repository root or a dedicated hosting branch
3. Enable GitHub Pages or another static host for the Storybook output

### Vercel

1. Build Storybook: `npm run build-storybook`
2. Deploy:

```bash
vercel --prod storybook-static
```

## Environment Variable

Set `EXPO_PUBLIC_STORYBOOK_URL` to point to your deployed Storybook:

```bash
EXPO_PUBLIC_STORYBOOK_URL=https://storybook.yourdomain.com
```

## Features

- ✅ Interactive step-by-step guides
- ✅ Component documentation
- ✅ User onboarding guide
- ✅ Speaker onboarding guide
- ✅ Troubleshooting sections
- ✅ Fully static (no server required)
- ✅ Works offline after first load

## Integration

The app's docs surface can include a button to open Storybook. When deployed, update `EXPO_PUBLIC_STORYBOOK_URL` to point to the published static site.
