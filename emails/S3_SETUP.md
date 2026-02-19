# S3 Setup for Email Assets

This guide explains how to set up AWS S3 for hosting email assets (images, videos) to ensure better email client compatibility through CDN delivery.

## Why Use S3/CDN for Email Assets?

1. **Better Email Client Compatibility**: Many email clients block local or relative image URLs. CDN URLs are more reliable.
2. **Faster Loading**: CDN provides faster asset delivery globally.
3. **Reliability**: S3 provides 99.999999999% (11 9's) durability.
4. **Scalability**: Automatically handles traffic spikes.

## Prerequisites

1. AWS Account
2. S3 Bucket created
3. AWS Access Key ID and Secret Access Key with S3 permissions
4. (Optional) CloudFront distribution for CDN

## Setup Steps

### 1. Create S3 Bucket

1. Go to AWS S3 Console
2. Create a new bucket (e.g., `hashpass-email-assets`)
3. Enable public read access for the `emails/assets/` prefix (or use CloudFront)
4. Configure CORS if needed

### 2. Set Up IAM User/Policy

Create an IAM user with the following policy:

**For Regular S3 Bucket:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::hashpass-email-assets/*"
    }
  ]
}
```

**For S3 Access Point:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:us-east-2:058264267235:accesspoint/hashpass-s3-emails/object/*"
    }
  ]
}
```

### 2b. Configure Bucket/Access Point Public Access Policy

**See [S3_BUCKET_POLICY.md](./S3_BUCKET_POLICY.md) for detailed instructions on setting up public access policies.**

### 3. Configure Environment Variables

Create a `.env` file in the project root or set these environment variables:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_CDN_URL=https://cdn.yourdomain.com  # Optional, for CloudFront
```

### 4. Upload Assets to S3

Run the upload script:

```bash
node scripts/upload-email-assets-to-s3.js
```

This will:
- Upload all images from `emails/assets/images/`
- Upload all videos from `emails/assets/videos/`
- Save asset URLs to `emails/asset-urls.json`

### 5. (Optional) Set Up CloudFront

For better performance and HTTPS:

1. Create a CloudFront distribution
2. Point it to your S3 bucket
3. Set `AWS_S3_CDN_URL` to your CloudFront domain
4. Configure caching headers

## Bucket Structure

After upload, your S3 bucket will have this structure:

```
your-bucket/
└── emails/
    └── assets/
        ├── images/
        │   ├── BSL.svg
        │   └── logo-full-hashpass-white.png
        └── videos/
            └── BSL_2025_환영_ES_en.mp4
```

## Usage in Code

The email service automatically uses S3 URLs when configured:

```typescript
import { sendWelcomeEmail } from '@/lib/email';

// S3 URLs are automatically used if AWS_S3_BUCKET_NAME is set
await sendWelcomeEmail(userEmail, 'en');
```

## Manual Asset URL Retrieval

You can also get asset URLs programmatically:

```typescript
import { getEmailAssetUrl } from '@/lib/s3-service';

const logoUrl = getEmailAssetUrl('images/BSL.svg');
// Returns: https://cdn.yourdomain.com/emails/assets/images/BSL.svg
```

## Troubleshooting

### Assets not uploading

1. Check AWS credentials are correct
2. Verify bucket name is correct
3. Ensure IAM user has proper permissions
4. Check bucket region matches `AWS_REGION`

### URLs not working in emails

1. Ensure assets are publicly accessible (or use CloudFront)
2. Verify CDN URL is correct
3. Check CORS configuration if accessing from web
4. Test URLs in browser before using in emails

### Fallback Behavior

If S3 is not configured, the email service will:
1. Try to use environment variables (`BSL_LOGO_URL`, `HASHPASS_LOGO_URL`)
2. Fall back to default URLs on `bsl2025.hashpass.tech`

## Security Best Practices

1. **Don't commit credentials**: Use environment variables or AWS Secrets Manager
2. **Use IAM roles**: In production, use IAM roles instead of access keys when possible
3. **Restrict permissions**: Only grant necessary S3 permissions
4. **Use CloudFront**: For public assets, use CloudFront with signed URLs if needed
5. **Enable versioning**: Enable S3 versioning for asset management

## Cost Considerations

- S3 storage: ~$0.023 per GB/month
- S3 requests: ~$0.0004 per 1,000 PUT requests
- CloudFront: ~$0.085 per GB data transfer (first 10TB)
- Email assets are typically small, so costs should be minimal

