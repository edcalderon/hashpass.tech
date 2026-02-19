# Email URLs Status

## ✅ Email Service Updated

The email service has been updated to automatically use S3 CDN URLs for all assets.

### URLs Being Used

Based on current configuration, emails will use these URLs:

1. **BSL Logo**
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg`
   - Status: ⚠️ Uploaded but not publicly accessible yet (403)

2. **HashPass Logo**
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png`
   - Status: ⚠️ Uploaded but not publicly accessible yet (403)

3. **Welcome Video**
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/videos/BSL_2025_환영_ES_en.mp4`
   - Status: ⚠️ Uploaded but not publicly accessible yet (403)
   - Note: Mux video player URL is also included in templates

### How It Works

The email service (`lib/email.ts`) uses this priority:

1. **S3 Service URLs** - Generated from `getEmailAssetUrl()` function
2. **asset-urls.json** - Fallback to uploaded asset URLs
3. **Environment Variables** - `BSL_LOGO_URL`, `HASHPASS_LOGO_URL`
4. **Default URLs** - Hardcoded fallback URLs

### Template Placeholders

The email templates use these placeholders that get automatically replaced:

- `[BSL_LOGO_URL]` → S3 URL for BSL logo
- `[HASHPASS_LOGO_URL]` → S3 URL for HashPass logo
- `[VIDEO_URL]` → S3 URL for video (if needed)

### Testing

Run the test script to verify:

```bash
node scripts/test-email-rendering.js
```

This will:
- Show which URLs are being used
- Verify placeholders are replaced
- Test URL accessibility
- Show any issues

### Next Steps

1. ⚠️ **Configure bucket policy** (see `S3_BUCKET_POLICY.md`)
2. ⚠️ **Disable block public access** on the bucket
3. ✅ Test URLs after making bucket public
4. ✅ Send test emails to verify rendering

### Current Status

- ✅ Assets uploaded to S3
- ✅ Email service configured to use S3 URLs
- ✅ Templates updated with placeholders
- ✅ URL replacement working
- ⚠️ Bucket needs public access policy (403 errors)

Once the bucket is made public, all URLs will work automatically in emails!

