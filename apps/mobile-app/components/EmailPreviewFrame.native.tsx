import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

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
      <WebView
        source={{ html }}
        style={styles.webView}
        scrollEnabled
        originWhitelist={['*']}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
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
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
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
