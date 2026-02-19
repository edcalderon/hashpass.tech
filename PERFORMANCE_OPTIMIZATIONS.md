# Performance & Memory Optimizations

## Overview
This document outlines the performance and memory optimizations implemented to address segmentation faults and high memory consumption.

## Issues Identified
1. **Large node_modules** (1.2GB) - Contributing to build time and memory usage
2. **Memory leaks** - Unmanaged subscriptions and timers
3. **Inefficient rendering** - ScrollView instead of FlatList for large lists
4. **Excessive caching** - Service worker caching large files
5. **No memoization** - Components re-rendering unnecessarily
6. **Real-time subscriptions** - Not properly cleaned up

## Optimizations Implemented

### 1. Memory Management (`lib/memory-manager.ts`)
- **Subscription Manager**: Tracks and automatically cleans up Supabase real-time subscriptions
- **Timer Manager**: Manages and clears timers to prevent leaks
- **Automatic Cleanup**: Expires old subscriptions after 1 hour
- **Max Subscriptions**: Limits concurrent subscriptions to 20

### 2. Performance Utilities (`lib/performance-utils.ts`)
- **Debounce/Throttle**: Limits function call frequency
- **Image Cache Manager**: Manages image caching with size limits (50 images max, 30min expiry)
- **Batched Updates**: Reduces re-renders by batching state updates
- **Lazy Image Loading**: Intersection Observer for images

### 3. Component Optimizations

#### SpeakerListWithDividers.tsx
- **Before**: ScrollView rendering all speakers at once
- **After**: FlatList with virtualization
  - `removeClippedSubviews={true}` - Unmounts off-screen items
  - `maxToRenderPerBatch={10}` - Limits batch rendering
  - `initialNumToRender={15}` - Only renders visible items initially
  - `windowSize={10}` - Controls render window size

#### SpeakerSearchAndSort.tsx
- **Memoization**: Added `useMemo` and `useCallback` for:
  - Filtered speakers
  - Sorted speakers
  - Grouped speakers
- **Reduced Re-renders**: Only recalculates when dependencies change

### 4. Real-time Subscription Cleanup

#### useRealtimeMeetingRequests.ts
- Integrated with `memoryManager` for automatic cleanup
- Registers subscriptions with unique IDs
- Cleans up on unmount or when limit reached

#### useRealtimeChat.ts
- Integrated with `memoryManager`
- Proper cleanup on component unmount
- Prevents subscription leaks

### 5. Service Worker Optimizations (`public/sw.js`)
- **Size Limits**: Only caches files < 5MB
- **File Type Filtering**: Skips caching large files (images, videos, PDFs)
- **Content-Length Check**: Validates file size before caching
- **Error Handling**: Catches and logs cache failures

### 6. Metro Bundler Optimizations (`metro.config.js`)
- **Single Worker**: `maxWorkers = 1` to reduce memory
- **Cache Versioning**: Prevents stale cache issues
- **Transformer Optimizations**: Minification settings for production

### 7. Workbox Configuration (`workbox-config.js`)
- **Reduced Cache Size**: 5MB → 2MB maximum file size
- **Entry Limits**: Maximum 50 cache entries
- **Prevents Memory Bloat**: Limits total cached data

## Performance Metrics

### Before Optimizations
- **Memory Usage**: High (segmentation faults)
- **Render Performance**: Slow with large lists
- **Cache Size**: Unlimited (causing memory issues)
- **Subscription Leaks**: Multiple unmanaged subscriptions

### After Optimizations
- **Memory Usage**: Controlled with limits and cleanup
- **Render Performance**: Optimized with FlatList virtualization
- **Cache Size**: Limited to 2MB per file, 50 entries max
- **Subscription Management**: Automatic cleanup and limits

## Best Practices

### For New Components
1. Use `FlatList` instead of `ScrollView` for large lists
2. Memoize expensive calculations with `useMemo`
3. Use `useCallback` for event handlers passed to children
4. Register subscriptions with `memoryManager`
5. Clean up timers and subscriptions in `useEffect` cleanup

### For Images
1. Use `imageCacheManager` for caching
2. Implement lazy loading with `useLazyImage`
3. Set appropriate `resizeMode` and size limits
4. Use `cache: 'force-cache'` for static images

### For Real-time Features
1. Always register subscriptions with `memoryManager`
2. Clean up in `useEffect` return function
3. Use unique subscription IDs
4. Monitor subscription count with `memoryManager.getStats()`

## Monitoring

### Memory Stats
```typescript
import { memoryManager } from '@/lib/memory-manager';

// Get current stats
const stats = memoryManager.getStats();
console.log('Subscriptions:', stats.subscriptions);
console.log('Timers:', stats.timers);
```

### Image Cache Stats
```typescript
import { imageCacheManager } from '@/lib/performance-utils';

// Cleanup expired entries
imageCacheManager.cleanup();

// Clear all cache
imageCacheManager.clear();
```

## Future Improvements
1. **Bundle Analysis**: Use `@expo/bundle-analyzer` to identify large dependencies
2. **Code Splitting**: Implement dynamic imports for heavy components
3. **Image Optimization**: Use WebP format and responsive images
4. **Virtual Scrolling**: Extend to more list components
5. **Memory Profiling**: Add periodic memory usage monitoring


