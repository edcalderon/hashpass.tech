import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Animated, ActivityIndicator } from 'react-native';
import { getSpeakerAvatarUrl, getLocalOptimizedAvatarUrl } from '../lib/string-utils';

interface SpeakerAvatarProps {
  name?: string;
  imageUrl?: string | null;
  size?: number;
  style?: any;
  showBorder?: boolean;
  isOnline?: boolean; // Accept but don't use (for compatibility)
}

export default function SpeakerAvatar({ 
  name, 
  imageUrl,
  size = 50, 
  style, 
  showBorder = false,
  isOnline // Accept but don't use
}: SpeakerAvatarProps) {
  // Initial state: start with loading=false, will be set to true when we have URLs to load
  // This ensures we show initials immediately if no URLs are available
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageTimeout, setImageTimeout] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false); // Track if image loaded successfully (state, not ref)
  
  // Track failed URLs to prevent infinite retry loops
  const failedUrlsRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map()); // Track retry attempts
  const currentUrlRef = useRef<string | null>(null);
  const isProcessingRef = useRef<boolean>(false); // Prevent concurrent processing
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Animated value for smooth fade-in
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Track which URL we're currently trying (local optimized, S3, or null)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null);
  const [urlSource, setUrlSource] = useState<'local' | 's3' | null>(null);
  
  // Store URLs in refs to prevent dependency issues
  const localOptimizedUrlRef = useRef<string | null>(null);
  const s3UrlRef = useRef<string | null>(null);
  const previousUrlsRef = useRef<{ local: string | null; s3: string | null }>({ local: null, s3: null });
  
  // Memoize computed values to determine avatar URL priority
  const { localOptimizedUrl, s3Url } = useMemo(() => {
    // Normalize imageUrl: treat null, undefined, or empty string as null
    const normalizedImageUrl = (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') 
      ? imageUrl.trim() 
      : null;
    
    // Priority 1: Check for local optimized avatar in public folder
    const localUrl = name ? getLocalOptimizedAvatarUrl(name) : null;
    
    // Priority 2: Use provided imageUrl (if valid) or generate S3 URL from name
    const s3 = normalizedImageUrl || (name ? getSpeakerAvatarUrl(name) : null);
    
    return { localOptimizedUrl: localUrl, s3Url: s3 };
  }, [imageUrl, name]);
  
  // Update refs when URLs change
  useEffect(() => {
    localOptimizedUrlRef.current = localOptimizedUrl;
    s3UrlRef.current = s3Url;
  }, [localOptimizedUrl, s3Url]);
  
  // Determine which URL to use (prioritize local optimized)
  // Only update if URLs actually changed
  useEffect(() => {
    const urlsChanged = 
      previousUrlsRef.current.local !== localOptimizedUrl ||
      previousUrlsRef.current.s3 !== s3Url;
    
    if (!urlsChanged && currentAvatarUrl) {
      return; // URLs haven't changed, don't reset
    }
    
    // Update previous URLs
    previousUrlsRef.current = { local: localOptimizedUrl, s3: s3Url };
    
    // Clear any existing timeout
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    
    // Reset processing flag
    isProcessingRef.current = false;
    
    // Reset states when URLs change
    setImageError(false);
    setImageTimeout(false);
    setImageLoaded(false);
    retryCountRef.current.clear(); // Clear retry counts for new URLs
    
    if (localOptimizedUrl) {
      // Try local optimized first - set loading state and URL
      isProcessingRef.current = false; // Reset processing flag before starting new load
      setImageLoading(true);
      setCurrentAvatarUrl(localOptimizedUrl);
      setUrlSource('local');
      currentUrlRef.current = localOptimizedUrl;
      console.log(`🎯 Trying local optimized avatar: ${localOptimizedUrl}`);
    } else if (s3Url) {
      // Fallback to S3 - set loading state and URL
      isProcessingRef.current = false; // Reset processing flag before starting new load
      setImageLoading(true);
      setCurrentAvatarUrl(s3Url);
      setUrlSource('s3');
      currentUrlRef.current = s3Url;
      console.log(`🌐 Trying S3 avatar: ${s3Url}`);
    } else {
      // No URLs available - show initials immediately (no loader needed)
      setCurrentAvatarUrl(null);
      setUrlSource(null);
      currentUrlRef.current = null;
      setImageLoading(false);
      setImageError(true);
      setImageTimeout(true);
      setImageLoaded(false);
      console.log(`❌ No avatar URLs available for: ${name}`);
    }
  }, [localOptimizedUrl, s3Url, name, imageUrl]); // Added name and imageUrl for debugging
  
  const avatarUrl = currentAvatarUrl;

  // Handle timeouts - only runs when avatarUrl changes
  useEffect(() => {
    if (!avatarUrl || isProcessingRef.current) {
      return;
    }
    
    // Check if this URL has already failed - if so, try fallback or show initials
    if (failedUrlsRef.current.has(avatarUrl)) {
      // If local optimized failed, try S3
      if (urlSource === 'local' && s3UrlRef.current && s3UrlRef.current !== avatarUrl) {
        if (!isProcessingRef.current) {
          isProcessingRef.current = true;
          setCurrentAvatarUrl(s3UrlRef.current);
          setUrlSource('s3');
          setImageError(false);
          setImageLoading(true);
          setImageTimeout(false);
          currentUrlRef.current = s3UrlRef.current;
          isProcessingRef.current = false;
        }
        return;
      }
      
      // All sources failed - show initials
      setImageError(true);
      setImageLoading(false);
      setImageTimeout(true);
      return;
    }
    
    // Set up timeout for this URL - size-based optimization
    const timeoutDuration = urlSource === 'local' 
      ? (size < 60 ? 3000 : 5000)  // Smaller avatars in lists get 3s, larger get 5s
      : 15000;
    
    timeoutIdRef.current = setTimeout(() => {
      // Check if URL is still the same
      if (currentUrlRef.current !== avatarUrl) {
        return; // URL changed, ignore this timeout
      }
      
      // Get current retry count
      const currentRetries = retryCountRef.current.get(avatarUrl) || 0;
      const maxRetries = urlSource === 'local' ? 2 : 0; // Allow 2 retries for local, none for S3
      
      if (currentRetries < maxRetries) {
        // Retry the same URL
        retryCountRef.current.set(avatarUrl, currentRetries + 1);
        console.log(`🔄 Retrying avatar load (${currentRetries + 1}/${maxRetries}):`, avatarUrl);
        
        // Reset loading state and try again
        setImageError(false);
        setImageLoading(true);
        setImageTimeout(false);
        setImageLoaded(false);
        fadeAnim.setValue(0);
        return;
      }
      
      // Mark URL as failed after max retries
      failedUrlsRef.current.add(avatarUrl);
      
      // If local optimized failed, try S3 fallback
      if (urlSource === 'local' && s3UrlRef.current && s3UrlRef.current !== avatarUrl) {
        if (!isProcessingRef.current) {
          isProcessingRef.current = true;
          setCurrentAvatarUrl(s3UrlRef.current);
          setUrlSource('s3');
          setImageError(false);
          setImageLoading(true);
          setImageTimeout(false);
          currentUrlRef.current = s3UrlRef.current;
          isProcessingRef.current = false;
        }
      } else {
        // All sources failed - show initials
        setImageTimeout(true);
        setImageLoading(false);
        setImageLoaded(false);
      }
    }, timeoutDuration);

    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [avatarUrl, urlSource]); // Removed name and imageUrl from deps to prevent loops

  // Memoized error handler to prevent recreating on every render
  const handleError = useCallback((error: any) => {
    if (isProcessingRef.current) return; // Already processing
    
    const errorMessage = error.nativeEvent?.error || error.message || 'Unknown error';
    const statusCode = error.nativeEvent?.statusCode || error.statusCode || 'unknown';
    
    console.log(`❌ Avatar load failed: ${avatarUrl} (${urlSource}) - ${errorMessage} (${statusCode})`);
    
    // Mark as not successfully loaded
    setImageLoaded(false);
    
    // Mark URL as failed
    if (avatarUrl) {
      failedUrlsRef.current.add(avatarUrl);
    }
    
    // If local optimized failed, try S3 fallback
    if (urlSource === 'local' && s3UrlRef.current && s3UrlRef.current !== avatarUrl) {
      if (!isProcessingRef.current) {
        isProcessingRef.current = true;
        setCurrentAvatarUrl(s3UrlRef.current);
        setUrlSource('s3');
        setImageError(false);
        setImageLoading(true);
        setImageTimeout(false);
        setImageLoaded(false); // Reset loaded state for new URL
        fadeAnim.setValue(0);
        currentUrlRef.current = s3UrlRef.current;
        // Reset processing flag after a short delay
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 100);
      }
    } else {
      // All sources failed - show initials
      setImageError(true);
      setImageLoading(false);
      setImageTimeout(true);
      setImageLoaded(false);
      isProcessingRef.current = false;
    }
  }, [avatarUrl, urlSource, name]);

  // Memoized load handler
  const handleLoad = useCallback(() => {
    console.log(`✅ Avatar loaded successfully: ${avatarUrl} (${urlSource})`);
    
    // Mark as successfully loaded - don't block on isProcessingRef
    setImageLoaded(true);
    
    // Clear loading state
    setImageLoading(false);
    setImageTimeout(false);
    setImageError(false);
    
    // Clear from failed URLs since it loaded successfully
    if (avatarUrl) {
      failedUrlsRef.current.delete(avatarUrl);
      retryCountRef.current.delete(avatarUrl); // Clear retry count on success
    }
    
    // Fade in the image smoothly
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    isProcessingRef.current = false;
  }, [avatarUrl, urlSource, name]);

  // Memoized load start handler
  const handleLoadStart = useCallback(() => {
    // Only reset error if this URL hasn't failed before
    if (avatarUrl && !failedUrlsRef.current.has(avatarUrl)) {
      setImageError(false);
      setImageTimeout(false);
      setImageLoading(true);
      setImageLoaded(false); // Reset loaded state when starting new load
      fadeAnim.setValue(0);
    }
  }, [avatarUrl]);

  // Helper to get initials (always two letters or '??')
  const getInitials = (n?: string) => {
    if (!n || typeof n !== 'string' || !n.trim()) return '??';
    const parts = n.trim().split(' ');
    if (parts.length === 1) return (parts[0][0] + (parts[0][1] || parts[0][0])).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const styles = getStyles(size, showBorder);
  
  // Determine what to show - simplified logic
  const hasUrlsAvailable = !!(localOptimizedUrl || s3Url);
  
  // Always show image if we have a URL (let Image component handle loading/errors)
  // Only hide if explicitly failed with no fallback
  const showImage = avatarUrl && !(imageError && imageTimeout && !s3UrlRef.current);
  
  // Show loading indicator only when actively loading and image not loaded yet
  const showLoading = imageLoading && !imageLoaded && avatarUrl;
  
  // Show placeholder only when no URLs or all sources definitively failed
  const showPlaceholder = !avatarUrl || (imageError && imageTimeout && !s3UrlRef.current);

  return (
    <View style={[styles.container, style]}>
      {/* Placeholder with initials (shown when no image or all sources failed) */}
      {showPlaceholder && (
        <View 
          style={styles.placeholderContainer}
          pointerEvents={showImage ? "none" : "auto"}
        >
          <Text style={styles.initialsText}>{getInitials(name)}</Text>
        </View>
      )}
      
      {/* Loading indicator (shown while loading) */}
      {showLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator 
            size={size < 40 ? 'small' : 'small'} 
            color="#007AFF" 
          />
        </View>
      )}
      
      {/* Image - Always render when we have a URL */}
      {avatarUrl && (
        <Animated.View
          style={[
            styles.imageContainer,
            { 
              opacity: imageLoaded ? fadeAnim : (imageLoading ? 0.5 : 0),
              zIndex: showImage ? 2 : 1
            }
          ]}
          pointerEvents="none"
        >
          <Image
            key={avatarUrl}
            source={{ uri: avatarUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={handleError}
            onLoad={handleLoad}
            onLoadStart={handleLoadStart}
          />
        </Animated.View>
      )}
    </View>
  );
}

const getStyles = (size: number, showBorder: boolean) => StyleSheet.create({
  container: {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden',
    position: 'relative',
  },
  imageContainer: {
    width: size,
    height: size,
    borderRadius: size / 2,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  image: {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: showBorder ? 2 : 0,
    borderColor: showBorder ? '#007AFF' : 'transparent',
    backgroundColor: 'transparent',
  },
  placeholderContainer: {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: showBorder ? 2 : 0,
    borderColor: showBorder ? '#007AFF' : 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  loadingContainer: {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: showBorder ? 2 : 0,
    borderColor: showBorder ? '#007AFF' : 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  initialsText: {
    fontSize: size * 0.38,
    fontWeight: '700',
    color: '#888888',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
