# Amplify Service Role Configuration Guide

## Problem

Amplify builds are failing with:
```
User: arn:aws:iam::058264267235:user/s3 is not authorized to perform: 
s3:GetObject on resource: "arn:aws:s3:::amplify-hashpasstech-dev-96465-deployment/#current-cloud-backend.zip"
```

**Root Cause:** Amplify is trying to use IAM user `s3` credentials instead of its own service role.

## Solution: Configure Amplify to Use Service Role

### Step 1: Verify Amplify App Information

From `amplify-meta.json`, we have:
- **App ID:** `d3ja863334bedw`
- **App Name:** `bsl2025.hashpass.tech`
- **Region:** `us-east-2`
- **Service Role ARN:** `arn:aws:iam::058264267235:role/amplify-hashpasstech-dev-96465-authRole`
- **Deployment Bucket:** `amplify-hashpasstech-dev-96465-deployment`

### Step 2: Configure Service Role in Amplify Console

1. **Log into AWS Amplify Console:**
   - Go to: https://console.aws.amazon.com/amplify/
   - Select your app: `bsl2025.hashpass.tech` (App ID: `d3ja863334bedw`)

2. **Navigate to App Settings:**
   - Click on your app
   - Go to **App settings** → **General**

3. **Configure Service Role:**
   - Scroll to **Service role** section
   - Click **Edit**
   - Select or create a service role with the following permissions:
     - `amplify-hashpasstech-dev-96465-authRole` (should already exist)
   - Click **Save**

4. **Verify Service Role Permissions:**
   The service role should have these managed policies or equivalent permissions:
   - `AWSLambda_FullAccess` (for Lambda functions)
   - `AmazonS3FullAccess` (for deployment bucket)
   - `CloudFormationFullAccess` (for stack management)
   - `IAMFullAccess` (for creating roles/policies)
   - `AmazonAPIGatewayAdministrator` (for API Gateway)

   **Note:** In production, use least-privilege policies scoped to your specific resources.

### Step 3: Remove AWS Credentials from Environment Variables

**CRITICAL:** Do NOT set AWS credentials in Amplify environment variables.

1. **Navigate to Environment Variables:**
   - Go to **App settings** → **Environment variables**
   - Select your branch (e.g., `bsl2025` or `main`)

2. **Check for AWS Credentials:**
   Look for and **DELETE** if present:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SESSION_TOKEN`
   - Any other AWS credential variables

3. **Keep Only Application Variables:**
   These should remain (if needed):
   - `AMPLIFY_EVENT_ID`
   - `AMPLIFY_SHOW_ALL_EVENTS`
   - `AMPLIFY_EVENT_DOMAIN`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NODEMAILER_*` variables
   - Other application-specific variables

   **DO NOT** include:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (Amplify knows its region)
   - `AWS_S3_BUCKET_NAME` (unless needed by your app code)

### Step 4: Verify Service Role in IAM Console

1. **Go to IAM Console:**
   - Navigate to: https://console.aws.amazon.com/iam/
   - Go to **Roles**
   - Search for: `amplify-hashpasstech-dev-96465-authRole`

2. **Check Role Permissions:**
   - Click on the role
   - Go to **Permissions** tab
   - Verify it has the necessary policies attached

3. **Check Trust Relationship:**
   - Go to **Trust relationships** tab
   - Should trust: `amplify.amazonaws.com`
   - Example trust policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Service": "amplify.amazonaws.com"
         },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

### Step 5: Verify IAM User `s3` Permissions

The `s3` IAM user should **ONLY** have permissions for:
- S3 bucket operations (for email assets in your application)
- Read/Write to specific S3 bucket(s) used by your application code

It should **NOT** have:
- Amplify permissions
- CloudFormation permissions
- Lambda permissions
- Any other AWS service permissions

**To verify:**
1. Go to IAM Console → Users → `s3`
2. Check **Permissions** tab
3. Ensure it only has S3 bucket policies, not Amplify/CloudFormation permissions

### Step 6: Test the Build

1. **Trigger a new build:**
   - In Amplify Console, go to your app
   - Click **Redeploy this version** or push a new commit

2. **Monitor the build:**
   - Check build logs
   - Verify it uses the service role (not the `s3` user)
   - Build should succeed without permission errors

### Step 7: Update Local Amplify Configuration (if needed)

If you're using Amplify CLI locally, ensure it uses the correct profile:

1. **Check local AWS configuration:**
   ```bash
   cat ~/.aws/credentials
   ```

2. **Verify Amplify uses correct profile:**
   ```bash
   cat amplify/.config/local-aws-info.json
   ```
   
   Should show:
   ```json
   {
     "dev": {
       "configLevel": "project",
       "useProfile": true,
       "profileName": "cli"
     }
   }
   ```

3. **Configure AWS CLI profile (if needed):**
   ```bash
   aws configure --profile cli
   ```
   
   Use credentials that have Amplify permissions (NOT the `s3` user).

## Troubleshooting

### Issue: "Service role not found"
**Solution:** Create a new service role in Amplify Console or attach the existing role.

### Issue: "Access denied" even with service role
**Solution:** 
1. Check service role permissions in IAM Console
2. Ensure trust relationship allows `amplify.amazonaws.com`
3. Verify role has permissions for S3, CloudFormation, Lambda

### Issue: Build still uses `s3` user
**Solution:**
1. Remove all AWS credential environment variables from Amplify Console
2. Clear any AWS credentials from build environment
3. Ensure service role is properly configured
4. Check if AWS CLI is installed in build and using wrong credentials

### Issue: Application code needs S3 access
**Solution:**
- Use the `s3` IAM user credentials **only** in your application `.env` file
- These credentials are used by your application code (e.g., `lib/s3-service.ts`)
- They should **NOT** be in Amplify environment variables
- They should **NOT** be used by Amplify build process

## Summary

✅ **DO:**
- Configure Amplify service role in Amplify Console
- Use service role for Amplify operations (builds, deployments)
- Keep AWS credentials in local `.env` for application code only
- Use IAM user `s3` only for application S3 operations

❌ **DON'T:**
- Set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in Amplify environment variables
- Use IAM user `s3` for Amplify operations
- Commit `.env` files to git
- Share AWS credentials in code or documentation

## References

- [AWS Amplify Service Role](https://docs.aws.amazon.com/amplify/latest/userguide/how-to-service-role-amplify-console.html)
- [Amplify IAM Permissions](https://docs.aws.amazon.com/amplify/latest/userguide/security-iam.html)
- [IAM Roles vs Users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_compare-resources.html)

