# Storybook Interactive Guides

Storybook provides interactive, step-by-step documentation for both user and speaker onboarding.

## Available Guides

### User Onboarding Guide
- **Step 1:** Sign In to Your Account
- **Step 2:** Explore Speakers & Events  
- **Step 3:** Send a Meeting Request
- **Step 4:** Track Your Requests
- **Troubleshooting:** Loading issues and solutions

Speaker Onboarding Guide
- **Step 1:** Sign In to Your Speaker Account
- **Step 2:** View Meeting Requests
- **Step 3:** Accept Meeting Requests
- **Step 4:** Craft and Manage Your Schedule
- **Step 5:** Decline Requests (If Needed)
- **Troubleshooting:** Loading issues and solutions

## Accessing the Guides

### Development
```bash
npm run storybook
```
Then navigate to:
- User Guide: `http://localhost:6006/?path=/docs/guides-user-onboarding--docs`
- Speaker Guide: `http://localhost:6006/?path=/docs/guides-speaker-onboarding--docs`

### Production (Static Site)
```bash
npm run build-storybook
```
Deploy the `storybook-static/` directory to your hosting service.

## Features

✅ **Interactive Navigation** - Step through each guide sequentially
✅ **Visual Documentation** - Clear, formatted instructions
✅ **Troubleshooting** - Built-in help sections
✅ **Component Examples** - See components in action
✅ **Fully Static** - No server required after build
✅ **Mobile Friendly** - Responsive design

## Integration

The guides are accessible from:
1. The `/docs` route in the app (button opens Storybook)
2. Direct URL to Storybook static site
3. Embedded in email links (pointing to `/docs`)

## Customization

Edit the guide stories in:
- `components/UserOnboardingGuide.stories.tsx`
- `components/SpeakerOnboardingGuide.stories.tsx`

Add screenshots, animations, or interactive demos as needed.

