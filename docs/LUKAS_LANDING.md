# $LUKAS Landing Page

## Overview

A stunning, animated landing page for $LUKAS - the first stable meme coin pegged 1:1 to the Colombian "lukas", backed by HashPass merchants and omni-chain crypto collateral.

## Features

### 🎨 Sections

1. **Hero Section** - Animated coin with floating/rotating animation, gradient background, and CTAs
2. **Why Section** - Explains why a stable meme coin makes sense
3. **How It Works** - 3-step timeline with animated connections
4. **Merchants Section** - Carousel of merchant categories
5. **Omni-chain Section** - Network visualization with pulsing animations
6. **Get LUKAS Section** - Wallet connection UI (ready for integration)
7. **FAQ Section** - Accordion-style Q&A

### ✨ Animations

- **Hero Coin**: Continuous floating, rotation, and scale pulse
- **Staggered Entries**: Sections animate in with delays
- **Timeline**: Sequential step animations with connecting lines
- **Merchant Cards**: Float-up animations on load
- **Network Icons**: Pulsing animations
- **FAQ Accordion**: Smooth expand/collapse with arrow rotation

## Routing

The landing page is automatically served when accessing `lukas.hashpass.tech`:

- **Route**: `/lukas`
- **Subdomain Detection**: Automatically detects `lukas.hashpass.tech` and routes to the landing page
- **Public Page**: No authentication required

## File Structure

```
app/
  lukas.tsx                    # Main landing page route
  index.tsx                    # Updated with subdomain detection
  _layout.tsx                  # Updated to register /lukas route

components/lukas/
  HeroSection.tsx              # Hero with animated coin
  WhySection.tsx                # Why stable meme coin section
  HowItWorksSection.tsx         # 3-step timeline
  MerchantsSection.tsx          # Merchant categories carousel
  OmniChainSection.tsx          # Network visualization
  GetLukasSection.tsx          # Wallet connection UI
  FAQSection.tsx                # Accordion FAQ
```

## Deployment

### For `lukas.hashpass.tech` Subdomain

1. **DNS Configuration**: Point `lukas.hashpass.tech` to your hosting provider
2. **Build & Deploy**: The existing build process will include the new route
3. **No Code Changes Needed**: Subdomain detection is automatic

### Testing Locally

To test the LUKAS landing page locally:

1. **Direct Route**: Navigate to `http://localhost:8081/lukas`
2. **Subdomain Simulation**: Add to `/etc/hosts`:
   ```
   127.0.0.1 lukas.hashpass.tech
   ```
   Then access `http://lukas.hashpass.tech:8081`

## Customization

### Colors

The landing page uses:
- **Primary Green**: `#22C55E` (LUKAS brand color)
- **Gold/Yellow**: `#FFD700` (Coin color)
- **Colombian Flag Colors**: Yellow, Blue, Red (in coin design)

### Content

All text content is in the component files and can be easily updated:
- Hero copy: `components/lukas/HeroSection.tsx`
- FAQ questions: `components/lukas/FAQSection.tsx`
- Merchant categories: `components/lukas/MerchantsSection.tsx`

## Future Integrations

### Wallet Connection

The `GetLukasSection` component is ready for wallet integration:

```typescript
// In GetLukasSection.tsx
const handleConnectWallet = () => {
  // TODO: Integrate with WalletConnect / RainbowKit / etc.
  // Currently shows "coming soon" message
};
```

### Smart Contract Integration

When ready, add:
- Minting functionality
- Balance display
- Transaction history
- Collateral proof display

## Branch Strategy

This landing page is designed to work on a dedicated `lukas` branch:

1. **Create Branch**: `git checkout -b lukas`
2. **Deploy Branch**: Configure your hosting to serve `lukas.hashpass.tech` from this branch
3. **Independent Deployment**: Can be deployed separately from main HashPass app

## Performance

- Uses `react-native-reanimated` for smooth 60fps animations
- Optimized for both mobile and desktop
- Lazy loading ready (sections can be code-split if needed)

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive (iOS, Android)
- Web-only (uses web-specific APIs for subdomain detection)

## Notes

- The page is fully public (no auth required)
- Uses existing theme system (dark/light mode support)
- Responsive design (mobile-first approach)
- All animations respect `prefers-reduced-motion` (can be added)

