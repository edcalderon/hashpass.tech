# Environment Variables

This document lists all environment variables required for the HashPass application.

## Supabase Configuration

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
```

## Email Configuration (Nodemailer/SMTP)

```bash
# Required variables
NODEMAILER_HOST=smtp.example.com          # SMTP server hostname
NODEMAILER_PORT=587                       # SMTP server port (usually 587)
NODEMAILER_USER=your_smtp_username        # SMTP authentication username
NODEMAILER_PASS=your_smtp_password        # SMTP authentication password
NODEMAILER_FROM=no-reply@hashpass.tech   # Email address to send from

# Optional variables
NODEMAILER_FROM_SUPPORT=support@hashpass.tech  # Support email address shown in email footers
                                               # Defaults to support@hashpass.tech if not set
```

### Email Footer Configuration

The `NODEMAILER_FROM_SUPPORT` variable is used to display the support email address in all email footers across all languages. This allows you to:

- Change the support email in one place (the environment variable)
- Keep translations clean without hardcoded email addresses
- Easily switch between different support emails for different environments

If `NODEMAILER_FROM_SUPPORT` is not set, the system will default to `support@hashpass.tech`.

## AWS Configuration (if using S3 for email assets)

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your_bucket_name
```

## Other Environment Variables

```bash
NODE_ENV=development  # or 'production'
```

## Example .env file

Create a `.env` file in the root directory with the following structure:

```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Email
NODEMAILER_HOST=smtp-relay.sendinblue.com
NODEMAILER_PORT=587
NODEMAILER_USER=your_username
NODEMAILER_PASS=your_password
NODEMAILER_FROM=no-reply@hashpass.tech
NODEMAILER_FROM_SUPPORT=support@hashpass.tech

# AWS (optional)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket

# Environment
NODE_ENV=development
```

