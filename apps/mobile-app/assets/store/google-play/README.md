# Google Play Store Assets

Generated assets are organized by Play Console upload field:

- `feature-graphic-1024x500.png`: feature graphic
- `phone/`: four 1440 x 2560 phone screenshots
- `tablet-7/`: two 1440 x 2560 tablet screenshots
- `tablet-10/`: two 2560 x 1440 tablet screenshots
- `chromebook/`: four 2560 x 1440 Chromebook screenshots
- `source/`: original generated conference photography used in the compositions

The final graphics use the repository's HashPass logo, app icon, BSL logo,
speaker avatars, and QR asset. The conference source photos contain no
third-party branding or readable text.

Regenerate from the mobile app directory:

```bash
node scripts/generate-google-play-assets.mjs
```

The Google Play video field is not included because it requires a public or
unlisted YouTube URL with ads disabled and no age restriction.
