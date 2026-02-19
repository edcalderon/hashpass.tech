# Email Screenshots Guide

## 📸 Capturing Screenshots for Email Templates

This guide explains how to capture screenshots of the app for use in email templates.

### Prerequisites

1. **Chrome/Chromium installed** ✅ (Already installed)
2. **Selenium dependencies** ✅ (Already installed)
3. **App running** - You need to start the development server first

### Quick Start

1. **Start the app:**
   ```bash
   npm run dev
   ```
   This will start the app at `http://localhost:8081` (or similar)

2. **Capture screenshots:**
   ```bash
   npm run screenshots:email
   ```
   
   Or with custom URL:
   ```bash
   APP_URL=http://localhost:8081 npm run screenshots:email
   ```

### Screenshots Captured

The script will capture the following screenshots in mobile view (375x812 - iPhone size):

1. **sign-in-screen.png** - Sign-in screen with email input field
   - URL: `/auth`

2. **explore-speakers-screen.png** - Speaker list/explore screen
   - URL: `/dashboard/explore`

3. **speaker-profile-screen.png** - Speaker profile with request meeting button
   - URL: `/events/bsl2025/speakers`

4. **request-meeting-screen.png** - Request meeting screen with form
   - URL: `/events/bsl2025/speakers/calendar`

5. **notifications-screen.png** - Notifications/requests screen
   - URL: `/dashboard/notifications`

### Output Location

Screenshots are saved to:
```
emails/assets/images/screenshots/
```

### Using Screenshots in Email Templates

After capturing, you can:

1. **Review screenshots** in the `emails/assets/images/screenshots/` directory
2. **Update email templates** to replace placeholders:
   ```html
   <!-- Before -->
   <p>📱 [Screenshot: Sign-in screen with email input field]</p>
   
   <!-- After -->
   <img src="[SCREENSHOT_SIGN_IN_URL]" alt="Sign-in screen" style="max-width: 100%; border-radius: 10px;" />
   ```

3. **Upload to S3** (optional):
   ```bash
   npm run upload:email-assets
   ```

### Configuration

You can customize the script by setting environment variables:

- `APP_URL` - Base URL of the app (default: `http://localhost:8081`)
- Viewport size is set to iPhone 12/13 (375x812) for mobile email compatibility

### Troubleshooting

**App not running:**
- Make sure you've started the dev server: `npm run dev`
- Check the port in the terminal output
- Set `APP_URL` to the correct URL

**Chrome not found:**
- Install Chrome or Chromium
- Or set `CHROME_BIN` environment variable

**Screenshots are blank:**
- Wait longer for page to load (increase `waitTime` in script)
- Check if the routes require authentication
- Verify the URLs are correct

### Next Steps

1. Capture screenshots with the app running
2. Review and optimize images if needed
3. Update email templates to use the screenshots
4. Upload to S3 for CDN delivery

