import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage, UPLOAD_CONFIG } from '../lib/cloudinary';

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
  maxSize = UPLOAD_CONFIG.maxFileSize,
  allowedTypes = UPLOAD_CONFIG.allowedFormats,
  uploadPreset = UPLOAD_CONFIG.uploadPreset,
  folder = UPLOAD_CONFIG.folder,
}: CloudinaryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    // Check file size
    if (file.size > maxSize) {
      const error = new Error(`File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`);
      onUploadError?.(error);
      return false;
    }

    // Check file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      const error = new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      onUploadError?.(error);
      return false;
    }

    return true;
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!validateFile(file)) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadImage(file, {
        publicId: undefined, // Let Cloudinary generate
        folder,
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
  }, [folder, onUploadSuccess, onUploadError]);

  const handleWebUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleWebFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

  const handleMobileUpload = useCallback(async () => {
    try {
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
        // Convert to File object for upload
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const file = new File([blob], asset.fileName || 'avatar.jpg', {
          type: asset.mimeType || 'image/jpeg',
        });

        await handleFileUpload(file);
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
