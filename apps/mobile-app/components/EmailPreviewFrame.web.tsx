import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

interface EmailPreviewFrameProps {
  html: string;
  height?: number;
}

export default function EmailPreviewFrame({ html, height = 480 }: EmailPreviewFrameProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <View style={[styles.frame, { height }]}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#007aff" />
        </View>
      )}
      <iframe
        title="Email preview"
        srcDoc={html}
        sandbox=""
        onLoad={() => setIsLoading(false)}
        style={{
          border: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          background: '#f5f7fa',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#f5f7fa',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fa',
  },
});
