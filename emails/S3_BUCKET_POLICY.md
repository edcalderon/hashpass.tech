# S3 Bucket Policy Configuration

## For Regular S3 Bucket

If you're using a regular S3 bucket (`hashpass-email-assets`), use this bucket policy:

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

## For S3 Access Point

If you're using an S3 Access Point (based on your CDN URL configuration), you need to:

### 1. Configure the Access Point Policy

Go to S3 → Access Points → `hashpass-s3-emails` → Policy

Use this policy format:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:us-east-2:058264267235:accesspoint/hashpass-s3-emails/object/emails/assets/*"
    }
  ]
}
```

**Important**: The resource ARN format for Access Points is:
```
arn:aws:s3:region:account-id:accesspoint/access-point-name/object/path/*
```

### 2. Also Configure the Underlying Bucket

The bucket that the access point points to also needs to allow public access:

1. Go to the underlying bucket (likely `hashpass-email-assets`)
2. Permissions → Block public access → Edit
3. Uncheck:
   - Block public access to buckets and objects granted through new access control lists (ACLs)
   - Block public access to buckets and objects granted through any access control lists (ACLs)
4. Save

### 3. Bucket Policy for Underlying Bucket

Add this to the underlying bucket's policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccessPointAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "s3-accesspoint.amazonaws.com"
      },
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::hashpass-email-assets/*"
    },
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

## Alternative: Use Direct Bucket URLs

If Access Point configuration is complex, you can:

1. Use the bucket directly (not through access point)
2. Update your `.env` file to remove or comment out `AWS_S3_CDN_URL`
3. The system will automatically use: `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/...`

## Testing

After configuring the policy, test with:

```bash
curl -I https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg
```

Should return: `HTTP/1.1 200 OK`

## Troubleshooting

### Error: "Policy has invalid resource"

- **For Access Points**: Make sure the resource ARN includes `/object/` in the path
- **For Regular Buckets**: Make sure the resource ARN format is `arn:aws:s3:::bucket-name/path/*` (three colons)

### Error: "Invalid Access Point Policy"

- Check that you're editing the Access Point policy, not the bucket policy
- Verify the access point name matches exactly
- Ensure the region and account ID are correct

### Still Getting 403 Forbidden

1. Check Block Public Access settings are disabled
2. Verify the policy was saved successfully
3. Wait a few minutes for changes to propagate
4. Check CloudTrail logs for denied requests

