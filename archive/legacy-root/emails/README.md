# Email Templates

This directory contains HTML email templates for user onboarding and communication.

## Structure

```
emails/
├── templates/          # HTML email templates
│   ├── welcome-en.html          # Welcome email (English)
│   ├── welcome-es.html          # Welcome email (Spanish)
│   ├── user-onboarding.html
│   └── speaker-onboarding.html
├── assets/            # Email assets (images, etc.)
│   └── images/          # Screenshot images for tutorials
│       ├── BSL.svg
│       └── logo-full-hashpass-white.png
└── README.md          # This file
```

## Templates

### Welcome Email
- **Files**: `templates/welcome-en.html`, `templates/welcome-es.html`
- **Purpose**: Early welcome email sent to all users when they first join
- **Features**:
  - Includes Mux video player with welcome video
  - BSL and HashPass logo branding
  - Available in English and Spanish
  - Feature highlights grid
  - Call-to-action button
  - Fully responsive with inline styles for email compatibility

### User Onboarding Email
- **File**: `templates/user-onboarding.html`
- **Purpose**: Welcome email for new users explaining how to:
  - Sign in to the app
  - Send meeting requests
  - Request meetings with speakers

### Speaker Onboarding Email
- **File**: `templates/speaker-onboarding.html`
- **Purpose**: Welcome email for speakers explaining how to:
  - Sign in to the app
  - Accept meeting requests
  - Craft and manage their schedule

## Taking Mobile App Screenshots

To capture mobile app screenshots for the email templates:

### Option 1: Browser DevTools (Recommended for Web)
1. Open Chrome DevTools (F12)
2. Click the device toolbar icon (Ctrl+Shift+M / Cmd+Shift+M)
3. Select a mobile device (iPhone 12 Pro, Pixel 5, etc.)
4. Navigate to your app
5. Take screenshots using:
   - Browser screenshot tool
   - OS screenshot tool
   - Browser extensions

### Option 2: React Native Debugger
1. Use React Native Debugger
2. Enable remote debugging
3. Use device screenshot tools

### Option 3: Physical Device
1. Use your phone's screenshot feature
2. Transfer images to your computer
3. Optimize images (compress, resize) before adding to emails

### Option 4: Emulator/Simulator
1. iOS Simulator: Device > Screenshot
2. Android Emulator: Use the camera icon in the toolbar
3. Save screenshots to `emails/assets/images/`

## Image Guidelines

- **Format**: PNG or JPG
- **Size**: Max 600px width for email compatibility
- **Naming**: Use descriptive names like `sign-in-step1.png`, `request-meeting-step2.png`
- **Optimization**: Compress images before use (use tools like TinyPNG or ImageOptim)

## S3/CDN Setup for Assets

For better email client compatibility, email assets (images, videos) should be hosted on S3/CDN. See [S3_SETUP.md](./S3_SETUP.md) for detailed setup instructions.

### Quick Setup

1. Set environment variables:
   ```bash
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   AWS_S3_BUCKET_NAME=your-bucket
   AWS_S3_CDN_URL=https://cdn.yourdomain.com  # Optional
   ```

2. Upload assets to S3:
   ```bash
   npm run upload:email-assets
   ```

3. Assets will be available at:
   - `https://cdn.yourdomain.com/emails/assets/images/BSL.svg`
   - `https://cdn.yourdomain.com/emails/assets/images/logo-full-hashpass-white.png`

## Usage

These templates can be:
1. Used directly in email sending functions
2. Customized with user-specific data
3. Integrated into the email sending system in `lib/email.ts`

The email service automatically uses S3 URLs when configured, with fallback to environment variables or default URLs.

## Localization

Templates support multiple languages. Add language-specific versions:
- `user-onboarding-en.html`
- `user-onboarding-es.html`
- `user-onboarding-ko.html`
- etc.

