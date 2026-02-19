# 🚨 CRITICAL SECURITY ISSUE: AWS Credentials Exposed

## Issue Summary

**Date Identified:** 2025-11-09  
**Severity:** CRITICAL  
**Status:** URGENT ACTION REQUIRED

The AWS access key `AKIAQ3EGSFHR7DFLD3XS` belonging to IAM user `s3` was publicly exposed in a GitHub repository commit.

**Exposed Location:**  
https://github.com/lstech-solutions/bsl2025.hashpass.tech/blob/468338ca88015e5a10c6a157e893fc4b63ac9e7f/.env

## Immediate Actions Required

### 1. ✅ COMPLETED: Remove .env from Git Tracking
- Added `.env` and related files to `.gitignore`
- Removed `.env` from git tracking (file remains locally)
- **Next:** Commit these changes to prevent future exposure

### 2. ⚠️ URGENT: Rotate AWS Credentials

**You MUST rotate the exposed credentials immediately:**

1. **Log into AWS Console** → IAM → Users → `s3`

2. **Deactivate the exposed access key:**
   - Go to "Security credentials" tab
   - Find access key `AKIAQ3EGSFHR7DFLD3XS`
   - Click "Deactivate" (DO NOT DELETE YET - wait 24-48 hours)

3. **Create a new access key:**
   - Click "Create access key"
   - Download the new credentials immediately
   - Update your `.env` file with new credentials

4. **Update all environments:**
   - Local `.env` file
   - AWS Amplify Console environment variables
   - Any CI/CD systems
   - AWS Parameter Store (if used)

5. **After 24-48 hours, delete the old key:**
   - Verify new key is working everywhere
   - Delete the old access key `AKIAQ3EGSFHR7DFLD3XS`

### 3. ⚠️ URGENT: Review AWS CloudTrail Logs

Check for any unauthorized access:
1. AWS Console → CloudTrail → Event history
2. Filter by IAM user: `s3`
3. Review all actions since the exposure date
4. Look for suspicious activity (unusual times, locations, actions)

### 4. ⚠️ URGENT: Review S3 Bucket Access

1. Check S3 bucket access logs
2. Review bucket policies
3. Verify no unauthorized objects were created/deleted
4. Check for unexpected API calls

## Amplify Build Issue

**Current Error:**
```
User: arn:aws:iam::058264267235:user/s3 is not authorized to perform: 
s3:GetObject on resource: "arn:aws:s3:::amplify-hashpasstech-dev-96465-deployment/#current-cloud-backend.zip"
```

**Root Cause:**
The IAM user `s3` is being used by Amplify CLI, but it only has permissions for S3 operations (email assets), not Amplify deployment operations.

**Solution:**
Amplify builds should use the Amplify service role, NOT the `s3` IAM user credentials.

### Fix Amplify Build Configuration

1. **In AWS Amplify Console:**
   - Go to your app: `bsl2025.hashpass.tech`
   - Settings → General → Service role
   - Ensure Amplify uses its own service role (not the `s3` user)

2. **Remove AWS credentials from Amplify build environment:**
   - Amplify Console → App settings → Environment variables
   - **DO NOT** set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in Amplify
   - These should only be in your application `.env` for S3 operations

3. **Verify Amplify uses its service role:**
   - The service role should have permissions for:
     - S3 (deployment bucket)
     - CloudFormation
     - Lambda
     - Other Amplify resources

### IAM User `s3` Permissions

The `s3` IAM user should ONLY have permissions for:
- S3 bucket operations (for email assets)
- Read/Write to specific S3 bucket(s) used by the application

It should **NOT** have:
- Amplify permissions
- CloudFormation permissions
- Lambda permissions
- Any other AWS service permissions

## Prevention Measures

### ✅ Implemented
- [x] Added `.env` to `.gitignore`
- [x] Removed `.env` from git tracking

### 📋 Recommended Next Steps
- [ ] Set up AWS Secrets Manager for credentials
- [ ] Use IAM roles instead of access keys where possible
- [ ] Implement git-secrets or similar tool to prevent future commits
- [ ] Set up AWS GuardDuty for threat detection
- [ ] Enable MFA for IAM users
- [ ] Review and rotate all AWS credentials regularly
- [ ] Use AWS Systems Manager Parameter Store for sensitive config

## Git History Cleanup (Optional but Recommended)

If you want to remove the exposed credentials from git history:

**⚠️ WARNING:** This rewrites git history. Coordinate with your team first.

```bash
# Use git-filter-repo or BFG Repo-Cleaner
# Example with git-filter-repo:
git filter-repo --path .env --invert-paths

# Force push (coordinate with team first!)
git push origin --force --all
```

**Alternative:** If the repository is public, consider:
1. Making it private temporarily
2. Rotating credentials immediately
3. Cleaning history
4. Making it public again

## References

- [AWS Security Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [GitHub Security: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [AWS IAM: Rotating Access Keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)

## Contact

If you suspect unauthorized access, contact AWS Support immediately and consider filing a security incident report.

