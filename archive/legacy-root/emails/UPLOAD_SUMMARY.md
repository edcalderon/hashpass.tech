# Email Assets Upload Summary

## ✅ Upload Status: SUCCESS

All email assets have been successfully uploaded to S3!

### Uploaded Assets

1. **BSL.svg** (11.8 KB)
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg`
   - Status: ✅ Uploaded

2. **logo-full-hashpass-white.png** (23.3 KB)
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png`
   - Status: ✅ Uploaded

3. **BSL_2025_환영_ES_en.mp4** (6.5 MB)
   - URL: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/videos/BSL_2025_환영_ES_en.mp4`
   - Status: ✅ Uploaded

### Asset URLs

All URLs are saved in `emails/asset-urls.json` for reference.

## ⚠️ Important: Make Assets Publicly Accessible

The assets are uploaded but currently return 403 Forbidden when accessed. You need to configure the bucket policy to allow public read access.

### Option 1: Bucket Policy (Recommended)

Add this bucket policy to `hashpass-email-assets`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hashpass-email-assets/emails/assets/*"
    }
  ]
}
```

### Option 2: Block Public Access Settings

1. Go to S3 Console → `hashpass-email-assets` bucket
2. Click "Permissions" tab
3. Edit "Block public access" settings
4. Uncheck "Block public access to buckets and objects granted through new access control lists (ACLs)"
5. Uncheck "Block public access to buckets and objects granted through any access control lists (ACLs)"
6. Save changes

### Option 3: Use CloudFront (Best for Production)

1. Create a CloudFront distribution
2. Point it to your S3 bucket
3. Set `AWS_S3_CDN_URL` to your CloudFront domain (e.g., `https://d1234abcd.cloudfront.net`)
4. This provides:
   - HTTPS (required for email clients)
   - Better performance
   - Lower costs for high traffic

## Testing URLs

After making assets public, test the URLs:

```bash
# Test image access
curl -I https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg

# Should return: HTTP/1.1 200 OK
```

## Next Steps

1. ✅ Assets uploaded to S3
2. ⚠️ Configure bucket policy for public access
3. ⚠️ (Optional) Set up CloudFront for HTTPS/CDN
4. ✅ Email service will automatically use S3 URLs

## Using in Emails

The email service (`lib/email.ts`) automatically uses S3 URLs when:
- `AWS_S3_BUCKET_NAME` is set
- Assets are accessible via the generated URLs

The `sendWelcomeEmail()` function will automatically replace placeholders with S3 URLs.

