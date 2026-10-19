import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import type { CloudinaryUploadPart } from '../types/cloudinary.types';

const DEFAULT_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_UPLOAD_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

interface CloudinaryImageUploadProps {
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: Error) => void;
  placeholder?: string;
  buttonStyle?: any;
  textStyle?: any;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  uploadPreset?: string;
  folder?: string;
}

export default function CloudinaryImageUpload({
  onUploadSuccess,
  onUploadError,
  placeholder = 'Upload Image',
  buttonStyle,
  textStyle,
  maxSize = DEFAULT_UPLOAD_MAX_SIZE,
  allowedTypes = DEFAULT_UPLOAD_FORMATS,
  uploadPreset = 'speaker_avatars',
  folder = 'speakers/avatars',
}: CloudinaryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: CloudinaryUploadPart, fileName: string): boolean => {
    // Check file size
    const fileSize = 'size' in file && typeof file.size === 'number' ? file.size : undefined;
    if (fileSize !== undefined && fileSize > maxSize) {
      const error = new Error(`File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`);
      onUploadError?.(error);
      return false;
    }

    // Check file type
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      const error = new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      onUploadError?.(error);
      return false;
    }

    return true;
  }, [allowedTypes, maxSize, onUploadError]);

  const handleFileUpload = useCallback(async (file: CloudinaryUploadPart, fileName = 'upload.jpg') => {
    if (!validateFile(file, fileName)) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Cloudinary is loaded on demand so importing this component does not
      // initialize Expo Constants/native modules on web or in Jest.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { uploadImage } = require('../lib/cloudinary') as typeof import('../lib/cloudinary');
      const result = await uploadImage(file, {
        publicId: undefined, // Let Cloudinary generate
        folder,
        uploadPreset,
        tags: ['avatar', 'uploaded'],
      });

      setUploadProgress(100);
      onUploadSuccess?.(result);
    } catch (error) {
      console.error('Upload failed:', error);
      onUploadError?.(error as Error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [folder, onUploadSuccess, onUploadError, uploadPreset, validateFile]);

  const handleWebUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleWebFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file, file.name);
    }
    // Reset input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

  const handleMobileUpload = useCallback(async () => {
    try {
      // Load the native picker only when the mobile control is used. This
      // keeps web and Jest consumers from importing Expo's native module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for avatars
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // React Native 0.79's FormData accepts local files only as URI-backed
        // parts. Keep the picker URI intact instead of fetching it into a Blob.
        const fileName = asset.fileName || 'avatar.jpg';
        await handleFileUpload({
          uri: asset.uri,
          name: fileName,
          type: asset.mimeType || 'image/jpeg',
        }, fileName);
      }
    } catch (error) {
      console.error('Mobile upload error:', error);
      onUploadError?.(error as Error);
    }
  }, [handleFileUpload, onUploadError]);

  const handlePress = useCallback(() => {
    if (uploading) return;

    if (Platform.OS === 'web') {
      handleWebUpload();
    } else {
      handleMobileUpload();
    }
  }, [uploading, handleWebUpload, handleMobileUpload]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.uploadButton, buttonStyle, uploading && styles.uploadButtonDisabled]}
        onPress={handlePress}
        disabled={uploading}
      >
        {uploading ? (
          <View style={styles.uploadingContent}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={[styles.uploadButtonText, textStyle]}>
              {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : 'Uploading...'}
            </Text>
          </View>
        ) : (
          <Text style={[styles.uploadButtonText, textStyle]}>{placeholder}</Text>
        )}
      </TouchableOpacity>

      {/* Hidden file input for web */}
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.map(type => `image/${type}`).join(',')}
          onChange={handleWebFileChange}
          style={{ display: 'none' }}
        />
      )}

      {/* Upload info */}
      <Text style={styles.infoText}>
        Max size: {Math.round(maxSize / (1024 * 1024))}MB
      </Text>
      <Text style={styles.infoText}>
        Formats: {allowedTypes.join(', ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  uploadButtonDisabled: {
    backgroundColor: '#87CEEB',
    opacity: 0.7,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
});

// Export types for use in other components
export type { CloudinaryImageUploadProps };
