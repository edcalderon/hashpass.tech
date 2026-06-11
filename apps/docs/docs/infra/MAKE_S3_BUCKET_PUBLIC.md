# How to Make S3 Bucket Publicly Accessible for Speaker Avatars

This guide will help you make the `hashpass-assets` S3 bucket publicly accessible so speaker avatars can be loaded in the application.

## Bucket Details
- **Bucket Name**: `hashpass-assets`
- **Region**: `us-east-2`
- **Path**: `speakers/avatars/*`

## Step-by-Step Instructions

### Step 1: Disable Block Public Access

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/buckets/hashpass-assets?region=us-east-2)
2. Select the `hashpass-assets` bucket
3. Click on the **Permissions** tab
4. Scroll to **Block public access (bucket settings)**
5. Click **Edit**
6. **Uncheck** these two options:
   - ☐ Block public access to buckets and objects granted through new access control lists (ACLs)
   - ☐ Block public access to buckets and objects granted through any access control lists (ACLs)
7. Click **Save changes**
8. Type `confirm` when prompted and click **Confirm**

### Step 2: Add Bucket Policy

1. Still in the **Permissions** tab, scroll down to **Bucket policy**
2. Click **Edit**
3. Paste the following JSON policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObjectForSpeakerAvatars",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hashpass-assets/speakers/avatars/*"
    }
  ]
}
```

4. Click **Save changes**

### Step 3: Verify Public Access

Test if the bucket is now publicly accessible:

```bash
curl -I "https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-rafael-gago.png"
```

**Expected response**: `HTTP/1.1 200 OK`

If you get `HTTP/1.1 403 Forbidden`, check:
- Block public access settings are disabled (Step 1)
- Bucket policy is correctly added (Step 2)
- The object path matches exactly: `speakers/avatars/*`

## Alternative: Using AWS CLI

If you have AWS CLI configured, you can run these commands:

```bash
# 1. Disable block public access
aws s3api put-public-access-block \
  --bucket hashpass-assets \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 2. Add bucket policy
aws s3api put-bucket-policy \
  --bucket hashpass-assets \
  --policy file://bucket-policy.json
```

Where `bucket-policy.json` contains:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObjectForSpeakerAvatars",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hashpass-assets/speakers/avatars/*"
    }
  ]
}
```

## Security Considerations

⚠️ **Important**: Making the bucket public means anyone with the URL can access the speaker avatars. This is fine for public speaker images, but:

1. **Only make the `speakers/avatars/` path public** - not the entire bucket
2. **Don't store sensitive data** in this bucket
3. **Monitor access** using S3 access logs if needed
4. **Consider using CloudFront** for better performance and security (optional)

## After Configuration

Once the bucket is public:
1. The `SpeakerAvatar` component will automatically load images from S3
2. No fallback to blockchainsummit.la will be needed
3. Images will load faster and more reliably

## Troubleshooting

### Still getting 403 Forbidden?

1. **Check the bucket policy** - Make sure the Resource ARN matches exactly:
   - Correct: `arn:aws:s3:::hashpass-assets/speakers/avatars/*`
   - Wrong: `arn:aws:s3:::hashpass-assets/*` (too broad, but would work)

2. **Verify Block Public Access is disabled** - All 4 settings should be unchecked

3. **Check object permissions** - If using ACLs, ensure objects have public read access

4. **Wait a few minutes** - S3 policy changes can take a minute to propagate

### Test with a specific image:

```bash
# Replace with an actual speaker name from your database
curl -I "https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-claudia-restrepo.png"
```

## Using CloudFront (Optional - Recommended for Production)

For better performance and security, consider using CloudFront:

1. Create a CloudFront distribution pointing to `hashpass-assets`
2. Set `AWS_S3_CDN_URL` environment variable to your CloudFront domain
3. CloudFront will cache images and provide HTTPS automatically

Example CloudFront URL:
```
https://d1234abcd.cloudfront.net/speakers/avatars/foto-claudia-restrepo.png
```

