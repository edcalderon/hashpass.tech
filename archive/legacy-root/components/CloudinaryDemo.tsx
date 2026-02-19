import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import SpeakerAvatar from './SpeakerAvatar';
import OptimizedImage, { OptimizedAvatar, OptimizedBanner } from './OptimizedImage';
import CloudinaryImageUpload from './CloudinaryImageUpload';
import { getAvatarUrl, getBannerUrl, getThumbnailUrl } from '../lib/cloudinary';

export default function CloudinaryDemo() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const handleUploadSuccess = (result: any) => {
    console.log('Upload successful:', result);
    setUploadedImage(result.secure_url);
    Alert.alert('Success', 'Image uploaded successfully!');
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload failed:', error);
    Alert.alert('Error', `Upload failed: ${error.message}`);
  };

  const sampleSpeakers = [
    { name: 'John Doe', id: 'john-doe' },
    { name: 'Jane Smith', id: 'jane-smith' },
    { name: 'Carlos Rodriguez', id: 'carlos-rodriguez' },
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Cloudinary Integration Demo</Text>
      
      {/* Speaker Avatars Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Optimized Speaker Avatars</Text>
        <Text style={styles.sectionSubtitle}>
          Auto WebP/AVIF, DPR-aware, smart cropping
        </Text>
        
        <View style={styles.avatarRow}>
          {sampleSpeakers.map((speaker) => (
            <View key={speaker.id} style={styles.avatarContainer}>
              <SpeakerAvatar name={speaker.name} size={80} showBorder={true} />
              <Text style={styles.avatarLabel}>{speaker.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Optimized Components Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Optimized Image Components</Text>
        
        <View style={styles.componentDemo}>
          <Text style={styles.componentTitle}>OptimizedAvatar</Text>
          <OptimizedAvatar
            source={{ uri: 'https://res.cloudinary.com/dfwjkpsma/image/upload/sample.jpg' }}
            size={100}
          />
        </View>

        <View style={styles.componentDemo}>
          <Text style={styles.componentTitle}>OptimizedThumbnail</Text>
          <OptimizedThumbnail
            source={{ uri: 'https://res.cloudinary.com/dfwjkpsma/image/upload/sample.jpg' }}
            width={200}
            height={150}
          />
        </View>
      </View>

      {/* Upload Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Image Upload Demo</Text>
        <Text style={styles.sectionSubtitle}>
          Upload to Cloudinary with automatic optimization
        </Text>
        
        <CloudinaryImageUpload
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          placeholder="Upload Avatar"
        />

        {uploadedImage && (
          <View style={styles.uploadedPreview}>
            <Text style={styles.uploadedTitle}>Uploaded Image:</Text>
            <OptimizedImage
              source={{ uri: uploadedImage }}
              width={200}
              height={200}
              style={styles.uploadedImage}
            />
          </View>
        )}
      </View>

      {/* URL Examples Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Generated URL Examples</Text>
        
        <View style={styles.urlExample}>
          <Text style={styles.urlTitle}>Avatar URL (100x100):</Text>
          <Text style={styles.urlText} selectable>
            {getAvatarUrl('speakers/avatars/john-doe', 100)}
          </Text>
        </View>

        <View style={styles.urlExample}>
          <Text style={styles.urlTitle}>Banner URL (1200x400):</Text>
          <Text style={styles.urlText} selectable>
            {getBannerUrl('speakers/banners/event', 1200, 400)}
          </Text>
        </View>

        <View style={styles.urlExample}>
          <Text style={styles.urlTitle}>Thumbnail URL (300x200):</Text>
          <Text style={styles.urlText} selectable>
            {getThumbnailUrl('speakers/thumbnails/sample', 300, 200)}
          </Text>
        </View>
      </View>

      {/* Performance Benefits */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Benefits</Text>
        
        <View style={styles.benefitList}>
          <Text style={styles.benefitItem}>✅ Auto WebP/AVIF conversion</Text>
          <Text style={styles.benefitItem}>✅ Smart CDN caching</Text>
          <Text style={styles.benefitItem}>✅ DPR-aware delivery</Text>
          <Text style={styles.benefitItem}>✅ Automatic resizing</Text>
          <Text style={styles.benefitItem}>✅ Smart cropping (g_auto)</Text>
          <Text style={styles.benefitItem}>✅ Quality optimization (q_auto)</Text>
          <Text style={styles.benefitItem}>✅ Zero infrastructure</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#1a1a1a',
  },
  section: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarLabel: {
    fontSize: 12,
    marginTop: 8,
    color: '#666',
    textAlign: 'center',
  },
  componentDemo: {
    alignItems: 'center',
    marginVertical: 20,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
  },
  componentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  uploadedPreview: {
    marginTop: 20,
    alignItems: 'center',
  },
  uploadedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  uploadedImage: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  urlExample: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  urlTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#1a1a1a',
  },
  urlText: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  benefitList: {
    paddingVertical: 8,
  },
  benefitItem: {
    fontSize: 14,
    color: '#333',
    marginVertical: 4,
  },
});
