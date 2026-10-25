import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { qrSystemService, QRScanResult, QRCode } from '../lib/qr-system';
import { cameraPermissionManager } from '../lib/camera-permissions';
import { qrScannerService } from '../lib/qr-scanner-service';
import { getCurrentAdminAccess, type AdminAccess } from '../lib/admin-access';
import { useQrCameraSession } from '../hooks/qr-camera-machine';
import { BarCodeScanner, type BarCodeScannerResult } from '../lib/barcode-scanner-compat';
import { ActionButton } from '@hashpass/ui/primitives';

// Dynamic import for web fallback
// Using .web.ts extension ensures Metro only resolves this on web
let webQRScannerFallback: any = null;
if (Platform.OS === 'web') {
  try {
    webQRScannerFallback = require('../lib/qr-scanner-web-fallback.web').webQRScannerFallback;
  } catch (e) {
    // Ignore if not available
  }
}

interface QRScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess?: (result: QRScanResult) => void;
  onScanError?: (error: string) => void;
  title?: string;
  description?: string;
  /**
   * Inspects a raw scan before it's handed to the pass/ticket QR pipeline
   * (qrScannerService.parseQRData + qrSystemService.validateAndUseQR), which
   * only understands this app's own minted QR tokens. Return true to claim
   * the scan (e.g. it's a HashPass Auth login QR) and skip that pipeline
   * entirely -- the caller is then responsible for whatever happens next
   * (navigation, showing its own result UI, etc). Returning false/undefined
   * falls through to the normal pass-scanning behavior unchanged.
   */
  onRawScan?: (data: string) => boolean | Promise<boolean>;
}

/* istanbul ignore next -- exercised by native/browser camera smoke tests */
export default function QRScanner({
  visible,
  onClose,
  onScanSuccess,
  onScanError,
  title = 'Scan QR Code',
  description = 'Position the QR code within the frame',
  onRawScan,
}: QRScannerProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [qrDetails, setQrDetails] = useState<QRCode | null>(null);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { send: sendCameraEvent, status: cameraStatus } = useQrCameraSession();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerWrapperRef = React.useRef<any>(null);

  const styles = getStyles(isDark, colors);

  useEffect(() => {
    if (visible) {
      sendCameraEvent({ type: 'OPEN' });
      // Reset state when modal opens
      setScanned(false);
      setScanResult(null);
      setIsProcessing(false);
      setQrDetails(null);
      setShowDetails(false);
      setUseWebFallback(false);
      setCameraError(null);
      
      // Check admin status
      if (user?.id) {
        // Resolve roles through the provider-aware backend endpoint. The
        // browser auth id is not necessarily the Supabase UUID used by the
        // database, so querying user_roles directly can return a 400.
        getCurrentAdminAccess()
          .then((access: AdminAccess) => {
            setIsUserAdmin(Boolean(access.globalRole) || access.eventRoles.length > 0);
          })
          .catch(() => setIsUserAdmin(false));
      } else {
        setIsUserAdmin(false);
      }
      
      // On web, enable fallback and initialize after permission is granted
      if (Platform.OS === 'web') {
        qrScannerService.enableWebFallback();
      }
      
      // Check permission status first
      checkPermissionStatus();
    } else {
      sendCameraEvent({ type: 'CLOSE' });
      // Reset permission state when modal closes
      setHasPermission(null);
      
      // Cleanup web fallback when closing (use async to avoid blocking)
      if (useWebFallback) {
        qrScannerService.stopWebFallback().catch((error: any) => {
          // Ignore DOM removal errors - React cleanup may have already happened
          if (!error.message?.includes('removeChild') &&
              !error.message?.includes('not a child')) {
            console.error('Error stopping web fallback on close:', error);
          }
        });
        setUseWebFallback(false);
      }
    }
  }, [visible, user, sendCameraEvent]);

  // Initialize web fallback when permission is granted
  useEffect(() => {
    if (Platform.OS === 'web' && visible && hasPermission === true && !useWebFallback) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        initializeWebFallback();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [visible, hasPermission, useWebFallback]);

  const checkPermissionStatus = async (forceRefresh: boolean = false) => {
    try {
      sendCameraEvent({ type: 'CHECK' });
      const result = await cameraPermissionManager.getPermissionStatus(forceRefresh);
      
      const isGranted = result.status === 'granted';
      setHasPermission(isGranted);
      sendCameraEvent(isGranted
        ? { type: 'PERMISSION_GRANTED' }
        : { type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: result.canAskAgain });
      if (isGranted && Platform.OS !== 'web') {
        // Native Expo Camera mounts immediately after permission is granted;
        // keep that transition in the same async operation instead of
        // chaining another effect off hasPermission.
        sendCameraEvent({ type: 'START' });
        sendCameraEvent({ type: 'SCANNING' });
      }
      
      // If not granted and can ask, don't auto-request - let user click button
      if (!isGranted && result.canAskAgain && result.status !== 'blocked') {
        setHasPermission(false);
      } else if (result.status === 'blocked' || (result.status === 'denied' && !result.canAskAgain)) {
        setHasPermission(false);
      }
      
      return result;
    } catch (error) {
      console.error('Error checking permission status:', error);
      setCameraError('Unable to check camera permission.');
      sendCameraEvent({ type: 'ERROR', message: 'Unable to check camera permission.' });
      setHasPermission(false);
      return null;
    }
  };

  const requestCameraPermission = async (forceFresh: boolean = true) => {
    try {
      sendCameraEvent({ type: 'REQUEST' });
      setHasPermission(null); // Show loading state
      
      // On web, requestWithFallback must be the first camera call made from
      // this button's user gesture. A preflight getUserMedia can consume the
      // browser prompt and leave the scanner stuck in a denied state.
      if (Platform.OS !== 'web') {
        const cameraCheck = await cameraPermissionManager.isCameraInUse();
        if (cameraCheck.inUse) {
          console.warn('Camera is in use:', cameraCheck.message);
          Alert.alert(
            'Camera In Use',
            cameraCheck.message || 'Camera is being used by another application. Please close other apps using the camera and try again.',
            [
              {
                text: 'Retry',
                onPress: () => {
                  setTimeout(() => requestCameraPermission(forceFresh), 1000);
                },
              },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setHasPermission(false),
              },
          ]
          );
          setHasPermission(false);
          setCameraError(cameraCheck.message || 'Camera is in use.');
          sendCameraEvent({ type: 'ERROR', message: cameraCheck.message || 'Camera is in use.' });
          return;
        }
      }
      
      // Use permission manager with force fresh to avoid cache issues
      const result = await cameraPermissionManager.requestWithFallback(forceFresh);
      
      // Check if result indicates camera in use
      if (result.message?.toLowerCase().includes('being used') || result.message?.toLowerCase().includes('in use')) {
        Alert.alert(
          'Camera In Use',
          result.message || 'Camera is being used by another application.',
          [
            {
              text: 'Retry',
              onPress: () => {
                setTimeout(() => requestCameraPermission(forceFresh), 1000);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setHasPermission(false),
            },
        ]
        );
        setHasPermission(false);
        setCameraError(result.message || 'Camera is in use.');
        sendCameraEvent({ type: 'ERROR', message: result.message || 'Camera is in use.' });
        return;
      }
      
      if (result.status === 'granted') {
        // Re-read status without prompting a second time. On web this keeps
        // the original button gesture as the only getUserMedia request.
        // Safari and some embedded browsers do not implement the Permissions
        // API, so trust the successful stream opened by the button on web.
        const verified = Platform.OS === 'web'
          ? result
          : await cameraPermissionManager.getPermissionStatus(false);
        setCameraError(null);
        setHasPermission(verified.status === 'granted');
        sendCameraEvent(verified.status === 'granted'
          ? { type: 'PERMISSION_GRANTED' }
          : { type: 'PERMISSION_REQUIRED', message: verified.message, canAskAgain: verified.canAskAgain });
      } else if (result.status === 'blocked' || (result.status === 'denied' && !result.canAskAgain)) {
        // Permission is blocked - show settings option
        setHasPermission(false);
        sendCameraEvent({ type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: false });
        if (Platform.OS === 'web') {
          cameraPermissionManager.showSettingsAlert(() => cameraPermissionManager.openSettings());
        }
      } else {
        setCameraError(result.message || 'Unable to access the camera.');
        setHasPermission(false);
        sendCameraEvent({ type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: result.canAskAgain });
        // Re-check status after request with fresh check
        setTimeout(async () => {
          await checkPermissionStatus(true);
        }, 500);
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setCameraError(error instanceof Error ? error.message : 'Unable to access the camera.');
      setHasPermission(false);
      sendCameraEvent({ type: 'ERROR', message: error instanceof Error ? error.message : 'Unable to access the camera.' });
    }
  };

  const resetScanner = useCallback(async () => {
    sendCameraEvent({ type: 'RESET' });
    setScanned(false);
    setIsProcessing(false);
    setScanResult(null);
    setQrDetails(null);
    setShowDetails(false);
    
    // Stop web fallback if active
    if (useWebFallback) {
      await qrScannerService.stopWebFallback();
      setUseWebFallback(false);
      // Reinitialize after a short delay
      if (Platform.OS === 'web' && hasPermission === true) {
        setTimeout(() => {
          initializeWebFallback();
        }, 500);
      }
    }
  }, [useWebFallback, hasPermission, sendCameraEvent]);

  // Memoize scan callback to prevent unnecessary re-renders of BarCodeScanner
  const scanCallback = useCallback(async ({ type, data }: BarCodeScannerResult) => {
    if (scanned || isProcessing) return;

    setScanned(true);
    setIsProcessing(true);

    try {
      if (await onRawScan?.(data)) {
        setIsProcessing(false);
        return;
      }

      // Use professional QR parser
      const parsed = qrScannerService.parseQRData(data);
      
      if (!parsed.isValid || !parsed.token) {
        throw new Error('Invalid QR code format');
        }

      const token = parsed.token;

      // Validate and use QR code
      const result = await qrSystemService.validateAndUseQR(
        token,
        user?.id,
        Platform.OS === 'web' ? 'web-scanner' : 'mobile-scanner'
      );

      setScanResult(result);

      if (result.valid) {
        // Fetch QR details to show pass information
        let qr = null;
        try {
          qr = await qrSystemService.getQRByToken(token);
          setQrDetails(qr);
          
          // If admin, show detailed view
          if (isUserAdmin) {
            setShowDetails(true);
          }
        } catch (e) {
          console.error('Error fetching QR details:', e);
        }

        if (onScanSuccess) {
          onScanSuccess(result);
        } else if (!isUserAdmin) {
          // Regular user success handling with pass details
          const passInfo = qr?.display_data;
          const passNumber = passInfo?.pass_number || 'N/A';
          const passType = passInfo?.pass_type || 'N/A';
          
          Alert.alert(
            'QR Code Valid ✓',
            `Pass Number: ${passNumber}\nPass Type: ${passType}\n\n${result.message || 'QR code scanned successfully'}`,
            [
              {
                text: 'OK',
                onPress: () => {
                  resetScanner();
                },
              },
            ]
          );
        }
      } else {
        const errorMessage = result.message || 'Invalid QR code';
        if (onScanError) {
          onScanError(errorMessage);
        } else {
          Alert.alert('QR Code Invalid', errorMessage, [
            {
              text: 'Try Again',
              onPress: () => {
                resetScanner();
              },
            },
            {
              text: 'Close',
              style: 'cancel',
              onPress: onClose,
            },
          ]);
        }
      }
    } catch (error: any) {
      console.error('Error scanning QR:', error);
      const errorMessage = error.message || 'Error processing QR code';
      if (onScanError) {
        onScanError(errorMessage);
      } else {
        Alert.alert('Error', errorMessage, [
          {
            text: 'Try Again',
            onPress: () => {
              resetScanner();
            },
          },
        ]);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [scanned, isProcessing, user?.id, isUserAdmin, onScanSuccess, onScanError, onClose, resetScanner, onRawScan]);

  const errorCallback = useCallback((error: Error) => {
    console.error('QR scan error:', error);
    if (onScanError) {
      onScanError(error.message);
    }
  }, [onScanError]);

  // Memoize scan handler to prevent BarCodeScanner re-renders
  const handleBarCodeScanned = useMemo(
    () => qrScannerService.createScanHandler(
      {
        onScan: scanCallback,
        onError: errorCallback,
      },
      {
        qrOnly: true,
        scanThrottle: 1000,
        hapticFeedback: true,
      }
    ),
    [scanCallback, errorCallback]
  );

  const initializeWebFallback = async () => {
    if (Platform.OS !== 'web' || !hasPermission) return;
    
    try {
      sendCameraEvent({ type: 'START' });
      // Wait for DOM and ref to be ready - try multiple times with better logging
      let wrapper: HTMLElement | null = null;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!wrapper && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
        
        // Try to get wrapper from ref
        if (scannerWrapperRef.current) {
          const refElement = scannerWrapperRef.current as any;
          
          // React Native Web exposes DOM via _nativeNode
          if (refElement?._nativeNode) {
            wrapper = refElement._nativeNode;
            break;
          }
          
          // Or it might be the element directly
          if (refElement?.nodeType === 1) {
            wrapper = refElement;
            break;
          }
          
          // Or find div inside
          if (typeof refElement === 'object' && refElement.querySelector) {
            const div = refElement.querySelector('div');
            if (div && div.nodeType === 1) {
              wrapper = div;
              break;
            }
          }
        }
        
        // Fallback: try querySelector
        wrapper = document.querySelector('[data-testid="scanner-wrapper"]') as HTMLElement ||
                 document.querySelector('.scanner-wrapper') as HTMLElement ||
                 document.getElementById('scanner-wrapper');
        
        if (wrapper) {
          break;
        }
      }
      
      if (!wrapper) {
        console.error('❌ Scanner wrapper not found after', maxAttempts, 'attempts');
        if (onScanError) {
          onScanError('Failed to initialize camera - wrapper not found');
        }
        setCameraError('Failed to initialize camera. Please retry.');
        sendCameraEvent({ type: 'ERROR', message: 'Failed to initialize camera. Please retry.' });
        return;
      }

      // Ensure wrapper has ID and attributes
      if (!wrapper.id) {
        wrapper.id = 'scanner-wrapper';
      }
      wrapper.setAttribute('data-testid', 'scanner-wrapper');
      wrapper.classList.add('scanner-wrapper');
      
      // Start scanner - ZXing will create video element automatically
      const result = await qrScannerService.startWebFallback(
        wrapper.id,
        async (scanResult: { text: string }) => {
          const barCodeResult: BarCodeScannerResult = {
            type: 'qr' as any,
            data: scanResult.text,
            bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } },
            cornerPoints: [],
          };
          
          if (handleBarCodeScanned) {
            handleBarCodeScanned(barCodeResult);
          }
        },
        (error: Error) => {
          console.error('Web fallback scan error:', error);
          if (onScanError) {
            onScanError(error.message);
          }
        }
      );

      if (result.success) {
        setUseWebFallback(true);
        setCameraError(null);
        sendCameraEvent({ type: 'SCANNING' });
      } else {
        setUseWebFallback(false);
        setCameraError(result.error || 'Unable to start the camera scanner.');
        sendCameraEvent({ type: 'ERROR', message: result.error || 'Unable to start the camera scanner.' });
      }
    } catch (error: any) {
      console.error('Error initializing web fallback:', error);
      setUseWebFallback(false);
      setCameraError(error?.message || 'Unable to start the camera scanner.');
      sendCameraEvent({ type: 'ERROR', message: error?.message || 'Unable to start the camera scanner.' });
    }
  };

  const handleRevoke = async () => {
    if (!scanResult || !qrDetails || !user) return;

    Alert.alert(
      'Revoke QR Code',
      'Are you sure you want to revoke this QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            const success = await qrSystemService.revokeQR(
              qrDetails.token,
              user.id,
              'Revoked by admin via scanner'
            );
            if (success) {
              Alert.alert('Success', 'QR code has been revoked');
              resetScanner();
            } else {
              Alert.alert('Error', 'Failed to revoke QR code');
            }
          },
        },
      ]
    );
  };

  const handleSuspend = async () => {
    if (!scanResult || !qrDetails || !user) return;

    const success = await qrSystemService.suspendQR(qrDetails.token, user.id);
    if (success) {
      Alert.alert('Success', 'QR code has been suspended');
      resetScanner();
    } else {
      Alert.alert('Error', 'Failed to suspend QR code');
    }
  };

  if (!visible) return null;

  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.permissionText}>Requesting camera permission...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Ionicons name="camera-outline" size={64} color={colors.error.main} />
            <Text style={styles.errorTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionErrorText}>
              {cameraError || (Platform.OS === 'web'
                ? 'Please enable camera permissions in your browser settings to scan QR codes.'
                : 'Please enable camera permissions in your device settings to scan QR codes.')}
            </Text>
            <TouchableOpacity 
              style={styles.button} 
              onPress={async () => {
                await requestCameraPermission(true); // Force fresh to avoid cache
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary]} 
              onPress={async () => {
                if (Platform.OS === 'web') {
                  // Show comprehensive instructions directly
                  cameraPermissionManager.showSettingsAlert();
                } else {
                  const opened = await cameraPermissionManager.openSettings();
                  if (!opened) {
                    cameraPermissionManager.showSettingsAlert();
                  }
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                {Platform.OS === 'web' ? 'Show Instructions' : 'Open Settings'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Don't render scanner if permission is not granted
  if (hasPermission !== true) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.scannerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Scanner View - Always render wrapper for web fallback */}
          <View 
            style={styles.scannerWrapper} 
            ref={scannerWrapperRef}
            // @ts-ignore - Web-specific attributes
            data-testid="scanner-wrapper"
            // @ts-ignore
            className="scanner-wrapper"
          >
            {Platform.OS !== 'web' && !useWebFallback ? (
            <BarCodeScanner
              onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
                style={[StyleSheet.absoluteFillObject, styles.cameraView]}
                barCodeTypes={qrScannerService.getBarCodeTypes()}
                type={qrScannerService.getRecommendedCameraType()}
              onMountError={(error: Error) => {
                console.error('Camera mount error:', error);
                  
                  // On web, try fallback to ZXing
                  if (Platform.OS === 'web' && webQRScannerFallback?.isAvailable()) {
                    setUseWebFallback(true);
                    // Initialize fallback after state update
                    setTimeout(() => {
                      initializeWebFallback();
                    }, 200);
                    return;
                  }
                  
                // Check if error indicates camera in use
                const errorMessage = error?.message || '';
                if (errorMessage.toLowerCase().includes('in use') || 
                    errorMessage.toLowerCase().includes('busy') ||
                    errorMessage.toLowerCase().includes('device') ||
                    errorMessage.toLowerCase().includes('already')) {
                  Alert.alert(
                    'Camera In Use',
                    'Camera is being used by another application. Please close other apps using the camera and try again.',
                    [
                      {
                        text: 'Retry',
                        onPress: async () => {
                          setHasPermission(false);
                          await requestCameraPermission(true);
                        },
                      },
                      {
                        text: 'Close',
                        style: 'cancel',
                        onPress: onClose,
                      },
                    ]
                  );
                  setHasPermission(false);
                }
              }}
            />
            ) : (
              // Web fallback - ZXing will create video element inside wrapper
              Platform.OS === 'web' && null
            )}

            {cameraError && hasPermission === true && cameraStatus === 'error' && (
              <View style={styles.cameraErrorBanner} pointerEvents="auto">
                <Ionicons name="alert-circle" size={20} color={colors.error.main} />
                <Text style={styles.cameraErrorText}>{cameraError}</Text>
                <ActionButton
                  mode={isDark ? 'dark' : 'light'}
                  variant="secondary"
                  label="Retry"
                  onPress={() => initializeWebFallback()}
                />
              </View>
            )}

            {/* Overlay with scanning frame - pointerEvents none to not block camera */}
            <View style={styles.overlay} pointerEvents="none">
              {/* Top overlay */}
              <View style={styles.overlayTop} />
              
              {/* Middle section with frame */}
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <View style={styles.overlaySide} />
              </View>

              {/* Bottom overlay */}
              <View style={styles.overlayBottom}>
                {isProcessing && (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.processingText}>Processing...</Text>
                  </View>
                )}
                {scanResult && !scanResult.valid && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="close-circle" size={24} color={colors.error.main} />
                    <Text style={styles.errorText}>{scanResult.message}</Text>
                  </View>
                )}
                {scanResult && scanResult.valid && (
                  <View style={styles.successContainer}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.success.main} />
                    <Text style={styles.successText}>{scanResult.message}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Instructions or Admin Details */}
          {showDetails && qrDetails && isUserAdmin ? (
            <ScrollView style={styles.adminDetailsContainer}>
              <View style={styles.adminDetailsHeader}>
                <Text style={styles.adminDetailsTitle}>QR Code Details</Text>
                <TouchableOpacity onPress={resetScanner}>
                  <MaterialIcons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, { color: qrDetails.status === 'active' ? colors.success.main : colors.error.main }]}>
                  {qrDetails.status.toUpperCase()}
                </Text>
              </View>

              {qrDetails.display_data && (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Pass Number</Text>
                    <Text style={styles.detailValue}>{qrDetails.display_data.pass_number || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Pass Type</Text>
                    <Text style={styles.detailValue}>{qrDetails.display_data.pass_type || 'N/A'}</Text>
                  </View>
                </>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>QR Type</Text>
                <Text style={styles.detailValue}>{qrDetails.qr_type || 'N/A'}</Text>
              </View>

              {qrDetails.expires_at && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Expires At</Text>
                  <Text style={styles.detailValue}>
                    {new Date(qrDetails.expires_at).toLocaleString()}
                  </Text>
                </View>
              )}

              <View style={styles.adminActions}>
                {qrDetails.status === 'active' && (
                  <TouchableOpacity style={styles.suspendButton} onPress={handleSuspend}>
                    <MaterialIcons name="pause-circle-outline" size={20} color={colors.text.primary} />
                    <Text style={styles.actionButtonText}>Suspend</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.revokeButton} onPress={handleRevoke}>
                  <MaterialIcons name="block" size={20} color="#FF3B30" />
                  <Text style={[styles.actionButtonText, { color: '#FF3B30' }]}>Revoke</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.instructions}>
              <Text style={styles.instructionText}>
                Position the QR code within the frame to scan
              </Text>
              {scanned && !isProcessing && (
                <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
                  <Text style={styles.resetButtonText}>Scan Again</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    modalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      minWidth: 300,
    },
    scannerContainer: {
      flex: 1,
      width: '100%',
      backgroundColor: 'transparent',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      paddingTop: 60,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    headerContent: {
      flex: 1,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    description: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.8)',
    },
    closeButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    scannerWrapper: {
      flex: 1,
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    },
    cameraView: {
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
    },
    cameraErrorBanner: {
      position: 'absolute',
      top: 16,
      left: 16,
      right: 16,
      zIndex: 3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: uiTokens.radius.input,
      backgroundColor: uiTokens.effects.mediaOverlayStrong,
    },
    cameraErrorText: {
      flex: 1,
      color: uiPalette(isDark).onAccent,
      fontSize: 13,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlayTop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      width: '100%',
    },
    overlayMiddle: {
      flexDirection: 'row',
      width: '100%',
    },
    overlaySide: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    scanFrame: {
      width: 250,
      height: 250,
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: colors.primary,
      borderWidth: 4,
    },
    topLeft: {
      top: 0,
      left: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
    },
    topRight: {
      top: 0,
      right: 0,
      borderLeftWidth: 0,
      borderBottomWidth: 0,
    },
    bottomLeft: {
      bottom: 0,
      left: 0,
      borderRightWidth: 0,
      borderTopWidth: 0,
    },
    bottomRight: {
      bottom: 0,
      right: 0,
      borderLeftWidth: 0,
      borderTopWidth: 0,
    },
    overlayBottom: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    processingContainer: {
      alignItems: 'center',
    },
    processingText: {
      color: '#FFFFFF',
      marginTop: 12,
      fontSize: 16,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 59, 48, 0.2)',
      padding: 12,
      borderRadius: 8,
    },
    errorText: {
      color: '#FFFFFF',
      marginLeft: 8,
      fontSize: 14,
    },
    permissionErrorText: {
      color: colors.text.secondary,
      fontSize: 16,
      lineHeight: 22,
      marginBottom: 8,
      textAlign: 'center',
    },
    successContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(52, 199, 89, 0.2)',
      padding: 12,
      borderRadius: 8,
    },
    successText: {
      color: '#FFFFFF',
      marginLeft: 8,
      fontSize: 14,
    },
    instructions: {
      padding: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
    },
    instructionText: {
      color: '#FFFFFF',
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 12,
    },
    resetButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    resetButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    permissionText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.text.primary,
      textAlign: 'center',
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 16,
      width: '100%',
      alignItems: 'center',
    },
    buttonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.divider,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonTextSecondary: {
      color: colors.text.primary,
    },
    adminDetailsContainer: {
      maxHeight: 400,
      backgroundColor: colors.background.paper,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    adminDetailsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    adminDetailsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    detailSection: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    detailValue: {
      fontSize: 16,
      color: colors.text.primary,
      fontWeight: '500',
    },
    adminActions: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
    },
    suspendButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.background.default,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 8,
    },
    revokeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.background.default,
      borderWidth: 1,
      borderColor: '#FF3B30',
      gap: 8,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
