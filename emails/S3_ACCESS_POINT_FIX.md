# S3 Access Point Access Denied - Solution

## Problem

You're getting "Access Denied" when trying to set the Access Point policy. This is because your IAM user/role doesn't have permissions to modify Access Point policies.

## Solution Options

### Option 1: Use Bucket Directly (Recommended for Public Assets)

Access Points are designed for controlled access, not public access. For email assets that need to be publicly accessible, it's simpler to use the bucket directly.

**Steps:**

1. **Update your `.env` file:**
   ```bash
   # Comment out or remove the Access Point URL
   # AWS_S3_CDN_URL=s3://arn:aws:s3:us-east-2:058264267235:accesspoint/hashpass-s3-emails
   
   # The system will automatically use the bucket URL
   ```

2. **Configure the bucket policy directly:**
   - Go to S3 Console → `hashpass-email-assets` bucket
   - Permissions → Bucket policy → Edit
   - Use this policy:

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

3. **Disable Block Public Access:**
   - Permissions → Block public access → Edit
   - Uncheck:
     - Block public access to buckets and objects granted through new access control lists (ACLs)
     - Block public access to buckets and objects granted through any access control lists (ACLs)
   - Save

4. **Test:**
   ```bash
   curl -I https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg
   ```

### Option 2: Grant IAM Permissions for Access Point (If You Must Use Access Point)

If you need to use the Access Point, you need these IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutAccessPointPolicy",
        "s3:GetAccessPointPolicy",
        "s3:ListAccessPoint",
        "s3:GetAccessPoint"
      ],
      "Resource": "arn:aws:s3:us-east-2:058264267235:accesspoint/hashpass-s3-emails"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:us-east-2:058264267235:accesspoint/hashpass-s3-emails/object/*"
    }
  ]
}
```

**However**, Access Points are typically not used for public access. They're designed for:
- VPC-only access
- Cross-account access
- Specific IAM role access

For public email assets, **Option 1 (direct bucket) is recommended**.

## Why Direct Bucket is Better for Email Assets

1. ✅ Simpler configuration
2. ✅ Standard public access pattern
3. ✅ Works with CloudFront easily
4. ✅ No Access Point complexity
5. ✅ Standard S3 URLs work everywhere

## After Switching to Direct Bucket

Your assets will be accessible at:
- `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg`
- `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png`
- `https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/videos/BSL_2025_환영_ES_en.mp4`

The email service will automatically use these URLs.

