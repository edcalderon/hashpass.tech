import React, { useState, useMemo } from 'react';
import { Image, ImageStyle, View, ActivityIndicator, Text } from 'react-native';
import { getCloudinaryUrl, isCloudinaryUrl } from '../lib/cloudinary';

interface OptimizedImageProps {
  source: { uri: string } | number;
  style?: ImageStyle;
  width?: number;
  height?: number;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  placeholder?: string;
  fallbackSource?: { uri: string } | number;
  onLoad?: () => void;
  onError?: (error: any) => void;
  quality?: 'auto' | 'best' | 'good' | 'eco' | 'low' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  dpr?: 'auto' | number;
  crop?: 'fill' | 'scale' | 'fit' | 'thumb' | 'crop' | 'limit';
  gravity?: 'auto' | 'center' | 'face' | 'faces' | 'north' | 'south' | 'east' | 'west';
  aspectRatio?: string;
  showLoading?: boolean;
  loadingComponent?: React.ReactNode;
  showPlaceholder?: boolean;
  placeholderComponent?: React.ReactNode;
}

export default function OptimizedImage({
  source,
  style,
  width,
  height,
  resizeMode = 'cover',
  placeholder,
  fallbackSource,
  onLoad,
  onError,
  quality = 'auto',
  format = 'auto',
  dpr = 'auto',
  crop = 'fill',
  gravity = 'auto',
  aspectRatio,
  showLoading = true,
  loadingComponent,
  showPlaceholder = true,
  placeholderComponent,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentSource, setCurrentSource] = useState(source);

  // Generate optimized URL for Cloudinary images
  const optimizedSource = useMemo(() => {
    if (typeof source === 'number') {
      return source; // Local asset
    }

    const { uri } = source;
    
    // If it's a Cloudinary URL, optimize it
    if (isCloudinaryUrl(uri)) {
      const optimizedUrl = getCloudinaryUrl(uri, {
        width,
        height,
        quality,
        format,
        dpr,
        crop,
        gravity,
        aspectRatio,
      });
      return { uri: optimizedUrl };
    }

    // Return original URL for non-Cloudinary images
    return source;
  }, [source, width, height, quality, format, dpr, crop, gravity, aspectRatio]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  };

  const handleError = (error: any) => {
    setIsLoading(false);
    
    // Try fallback source if available
    if (fallbackSource && currentSource !== fallbackSource) {
      setCurrentSource(fallbackSource);
      setIsLoading(true);
      setHasError(false);
    } else {
      setHasError(true);
      onError?.(error);
    }
  };

  // Reset loading state when source changes
  React.useEffect(() => {
    if (optimizedSource !== currentSource) {
      setCurrentSource(optimizedSource);
      setIsLoading(true);
      setHasError(false);
    }
  }, [optimizedSource, currentSource]);

  // Show loading state
  if (isLoading && showLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return (
      <View style={[style, styles.loadingContainer]}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  // Show error state
  if (hasError && showPlaceholder) {
    if (placeholderComponent) {
      return <>{placeholderComponent}</>;
    }
    return (
      <View style={[style, styles.errorContainer]}>
        {placeholder ? (
          <Text style={styles.placeholderText}>{placeholder}</Text>
        ) : (
          <Text style={styles.placeholderText}>Image unavailable</Text>
        )}
      </View>
    );
  }

  return (
    <Image
      source={currentSource}
      style={style}
      resizeMode={resizeMode}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}

// Convenience components for specific use cases
export function OptimizedAvatar({
  source,
  size = 100,
  style,
  ...props
}: Omit<OptimizedImageProps, 'width' | 'height'> & {
  size?: number;
}) {
  return (
    <OptimizedImage
      source={source}
      width={size}
      height={size}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
      crop="fill"
      gravity="face"
      quality="auto:best"
      {...props}
    />
  );
}

export function OptimizedBanner({
  source,
  width,
  height = 300,
  style,
  ...props
}: Omit<OptimizedImageProps, 'height'> & {
  height?: number;
}) {
  return (
    <OptimizedImage
      source={source}
      width={width}
      height={height}
      style={style}
      crop="fill"
      gravity="auto"
      quality="auto:good"
      {...props}
    />
  );
}

export function OptimizedThumbnail({
  source,
  width = 300,
  height = 200,
  style,
  ...props
}: Omit<OptimizedImageProps, 'width' | 'height'>) {
  return (
    <OptimizedImage
      source={source}
      width={width}
      height={height}
      style={style}
      crop="fill"
      gravity="auto"
      quality="auto:good"
      {...props}
    />
  );
}

const styles = {
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
};

export type { OptimizedImageProps };
