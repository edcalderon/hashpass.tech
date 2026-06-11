# Cloudinary Integration Guide

This document explains the Cloudinary integration implemented for optimal image performance in your Expo Web application.

## Overview

Cloudinary is integrated as the primary image optimization service, providing:
- **Auto WebP/AVIF conversion** - Automatic format optimization for browsers
- **Smart CDN caching** - Fast global response times via multi-CDN edge networks
- **DPR-aware delivery** - Device pixel ratio optimization
- **Automatic resizing & smart cropping** - On-the-fly transformations
- **Zero infrastructure management** - Upload → serve → done
- **Browser-compatible** - Works in Expo Web without Node.js dependencies

## Configuration

### Environment Variables

Your `.env` file already contains the Cloudinary configuration:

```env
CLOUDINARY_URL=cloudinary://922669241128932:ZQiHZwQzJrScX63zjIW63iKs8R0@dfwjkpsma
```

This URL contains:
- **Cloud Name**: `dfwjkpsma`
- **API Key**: `922669241128932`
- **API Secret**: `ZQiHZwQzJrScX63zjIW63iKs8R0`

### Browser-Compatible Implementation

The integration uses a custom URL builder that works in browser environments without requiring Node.js dependencies. This ensures compatibility with Expo Web while maintaining all Cloudinary optimization features.

### Cloudinary Dashboard Setup

1. **Create Upload Presets**
   - Go to Cloudinary Dashboard → Settings → Upload
   - Create unsigned upload preset: `speaker_avatars`
   - Settings:
     - Folder: `speakers/avatars`
     - Allowed formats: `jpg, jpeg, png, webp, avif`
     - Transformation: `limit_1000x1000`
     - Quality: `auto:good`
     - Format: `auto`

2. **Folder Structure**
   ```
   speakers/
   ├── avatars/
   │   ├── john-doe.jpg
   │   ├── jane-smith.jpg
   │   └── ...
   └── banners/
       ├── event-banner.jpg
       └── ...
   ```

## Implementation

### Core Components

#### 1. Cloudinary Utility (`lib/cloudinary.ts`)

Provides optimized URL generation and upload functionality:

```typescript
import { getAvatarUrl, getBannerUrl, uploadImage } from './lib/cloudinary';

// Optimized avatar URL
const avatarUrl = getAvatarUrl('speakers/avatars/john-doe', 100);

// Optimized banner URL
const bannerUrl = getBannerUrl('speakers/banners/event', 1200, 400);

// Upload image
const result = await uploadImage(file, {
  folder: 'speakers/avatars',
  tags: ['avatar', 'speaker']
});
```

#### 2. Optimized Avatar Component (`components/SpeakerAvatar.tsx`)

Automatically uses Cloudinary URLs with fallback to local/S3:

```typescript
<SpeakerAvatar
  name="John Doe"
  size={100}
  showBorder={true}
/>
```

**Priority Order**:
1. Cloudinary (optimized with WebP/AVIF, DPR, quality)
2. Local optimized (`/assets/speakers/avatars/`)
3. S3 bucket (fallback)

#### 3. Image Upload Component (`components/CloudinaryImageUpload.tsx`)

Cross-platform image upload with validation:

```typescript
<CloudinaryImageUpload
  onUploadSuccess={(result) => console.log('Uploaded:', result)}
  onUploadError={(error) => console.error('Upload failed:', error)}
  placeholder="Upload Avatar"
/>
```

#### 4. General Optimized Image (`components/OptimizedImage.tsx`)

For all image types with automatic optimization:

```typescript
<OptimizedImage
  source={{ uri: 'https://cloudinary.com/...' }}
  width={300}
  height={200}
  quality="auto:good"
  format="auto"
  dpr="auto"
/>
```

### URL Generation Examples

#### Avatar URLs
```typescript
// Input: "John Doe", size: 100
// Output: https://res.cloudinary.com/dfwjkpsma/image/upload/c_fill,g_face,h_100,w_100,q_auto:best,f_auto,dpr_auto/speakers/avatars/john-doe
```

#### Banner URLs
```typescript
// Input: "event-banner", width: 1200, height: 400
// Output: https://res.cloudinary.com/dfwjkpsma/image/upload/c_fill,g_auto,h_400,w_1200,q_auto:good,f_auto,dpr_auto/speakers/banners/event-banner
```

#### Thumbnail URLs
```typescript
// Input: "image-id", width: 300, height: 200
// Output: https://res.cloudinary.com/dfwjkpsma/image/upload/c_fill,g_auto,h_200,w_300,q_auto:good,f_auto,dpr_auto/image-id
```

## Performance Benefits

### 1. Format Optimization
- **WebP**: Chrome, Firefox, Edge (25-35% smaller than JPEG)
- **AVIF**: Chrome, Firefox (50% smaller than JPEG)
- **Fallback**: JPEG/PNG for unsupported browsers

### 2. Quality Optimization
- `q_auto`: Automatically adjusts quality for optimal file size
- `q_auto:best`: Higher quality for avatars
- `q_auto:good`: Balanced quality for banners

### 3. DPR Optimization
- `dpr_auto`: Serves appropriate resolution for device
- 1x: Standard displays
- 2x/3x: Retina/high-DPI displays

### 4. Smart Cropping
- `g_auto`: AI-powered content-aware cropping
- `g_face`: Face detection for avatars
- `g_center`: Center-focused cropping

## Usage Guidelines

### For Avatars
```typescript
// Use SpeakerAvatar component for speaker images
<SpeakerAvatar name="Speaker Name" size={80} />

// Or use OptimizedAvatar for custom avatars
<OptimizedAvatar
  source={{ uri: 'cloudinary-url' }}
  size={100}
/>
```

### For Banners/Hero Images
```typescript
<OptimizedBanner
  source={{ uri: 'cloudinary-url' }}
  width={1200}
  height={400}
/>
```

### For General Images
```typescript
<OptimizedImage
  source={{ uri: 'image-url' }}
  width={width}
  height={height}
  quality="auto:good"
/>
```

## Upload Workflow

### 1. Client Upload (Recommended)
```typescript
import CloudinaryImageUpload from './components/CloudinaryImageUpload';

// In your component
<CloudinaryImageUpload
  onUploadSuccess={(result) => {
    // result.public_id - Cloudinary public ID
    // result.secure_url - Optimized URL
    // Save to database
  }}
/>
```

### 2. Server Upload (Advanced)
```typescript
import { cloudinary } from './lib/cloudinary';

const result = await cloudinary.uploader.upload(file, {
  folder: 'speakers/avatars',
  public_id: 'custom-name',
  transformation: [
    { width: 1000, height: 1000, crop: 'limit' },
    { quality: 'auto:good', format: 'auto' }
  ]
});
```

## Migration Guide

### Existing Local Images
1. Upload existing avatar images to Cloudinary
2. Use naming convention: `speakers/avatars/{speaker-name}`
3. Update database with Cloudinary URLs (optional - will auto-generate)

### Existing S3 Images
1. Cloudinary integration works alongside S3
2. Gradually migrate high-traffic images to Cloudinary
3. Fallback ensures no broken images during migration

## Monitoring & Analytics

Cloudinary provides detailed analytics:
- Bandwidth usage
- Transformation counts
- Popular images
- Geographic distribution

Access via: Cloudinary Dashboard → Analytics

## Best Practices

1. **Use descriptive public IDs**: `speakers/avatars/john-doe` vs `abc123`
2. **Organize in folders**: Group related images
3. **Add tags**: For easier management and analytics
4. **Set appropriate quality**: `q_auto:best` for avatars, `q_auto:good` for banners
5. **Enable format auto**: `f_auto` for automatic WebP/AVIF
6. **Use DPR auto**: `dpr_auto` for device-appropriate resolution

## Troubleshooting

### Common Issues

1. **Upload fails**
   - Check upload preset configuration
   - Verify API credentials
   - Ensure file size < 10MB

2. **Images not loading**
   - Check public ID format
   - Verify folder structure
   - Check transformations syntax

3. **Performance issues**
   - Ensure `f_auto` and `q_auto` are used
   - Check CDN caching headers
   - Monitor transformation counts

### Debug URLs
```typescript
// Add debug parameters to URLs
const debugUrl = getCloudinaryUrl(publicId, {
  width: 100,
  height: 100,
  // Add this for debugging
  // Will show transformation details
});

// Check generated URLs
console.log('Cloudinary URL:', debugUrl);
```

## Support

- Cloudinary Documentation: https://cloudinary.com/documentation
- React SDK: https://cloudinary.com/documentation/react_integration
- API Reference: https://cloudinary.com/documentation/image_upload_api_reference
