import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import ScanResultCard from './qr/ScanResultCard';
import ExternalClaimReview from './qr/ExternalClaimReview';
import { ActionButton } from '@hashpass/ui/primitives';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { qrSystemService, QRScanResult, QRCode } from '../lib/qr-system';
import { getCurrentAdminAccess } from '../lib/admin-access';
import { cameraPermissionManager, type CameraPermissionResult } from '../lib/camera-permissions';
import { apiClient } from '../lib/api-client';
import { PassType } from '../lib/pass-system';
import { qrScannerService } from '../lib/qr-scanner-service';
import { resolveHashpassQrPayload } from '../lib/qr-payload-resolver';
import type { HashpassQrResolution, ParsedHashpassQrPayload } from '../types/qr-payload.types';
import type { ExternalTicketClaimInspection } from '../types/ExternalTicketClaim.types';
import { useQrCameraSession } from '../hooks/qr-camera-machine';
import { BarCodeScanner, type BarCodeScannerResult } from '../lib/barcode-scanner-compat';

// Import web-only QR scanner
let WebQRScanner: any = null;
if (Platform.OS === 'web') {
  try {
    WebQRScanner = require('./WebQRScanner').default;
  } catch (e) {
    console.warn('WebQRScanner not available:', e);
  }
}

interface AdminQRScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess?: (result: QRScanResult) => void;
  onPassResolved?: (passId: string) => void;
}

/* istanbul ignore next -- exercised by native/browser camera smoke tests */
export default function AdminQRScanner({
  visible,
  onClose,
  onScanSuccess,
  onPassResolved,
}: AdminQRScannerProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [resolvedPayload, setResolvedPayload] = useState<HashpassQrResolution | null>(null);
  const [externalTicketClaim, setExternalTicketClaim] = useState<ExternalTicketClaimInspection | null>(null);
  const [qrDetails, setQrDetails] = useState<QRCode | null>(null);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(true); // Track admin check status
  const [showDetails, setShowDetails] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useWebFallback, setUseWebFallback] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerWrapperRef = React.useRef<any>(null);
  const scannerCleanupRef = React.useRef<(() => Promise<void>) | null>(null);
  const { send: sendCameraEvent, canAskAgain: cameraCanAskAgain } = useQrCameraSession();

  const styles = getStyles(isDark, colors);

  useEffect(() => {
    if (visible && user) {
      sendCameraEvent({ type: 'OPEN' });
      // Reset admin check state
      setAdminCheckLoading(true);
      setIsUserAdmin(false);
      
      // Check admin status first
      checkAdminStatus();
      
      // Only check permissions if admin check passes
      // We'll check permissions after admin check completes
      // Reset scanner state when modal opens
      setScanned(false);
      setIsProcessing(false);
      setScanResult(null);
      setResolvedPayload(null);
      setExternalTicketClaim(null);
      setQrDetails(null);
      setShowDetails(false);
      setCameraReady(false);
      setCameraError(null);
      setUseWebFallback(false);
      
      // On web, enable fallback
      if (Platform.OS === 'web') {
        qrScannerService.enableWebFallback();
      }
    } else if (!visible) {
      sendCameraEvent({ type: 'CLOSE' });
      // Reset camera state when modal closes
      setCameraReady(false);
      setCameraError(null);
      setAdminCheckLoading(true);
      
      // Cleanup web fallback IMMEDIATELY when closing (before React unmounts)
      // This prevents React from trying to remove nodes that html5-qrcode manages
      if (scannerCleanupRef.current) {
        // Run cleanup immediately and synchronously
        scannerCleanupRef.current().then(() => {
          scannerCleanupRef.current = null;
          setUseWebFallback(false);
        }).catch(() => {
          // Errors already handled in cleanup function
          scannerCleanupRef.current = null;
          setUseWebFallback(false);
        });
      } else if (useWebFallback) {
        // Fallback if cleanup ref is not set
        qrScannerService.stopWebFallback().catch((error: any) => {
          // Suppress DOM errors - these are expected when React unmounts
          const errorMsg = error?.message || String(error);
          if (!errorMsg.includes('removeChild') && 
              !errorMsg.includes('not a child') &&
              !errorMsg.includes('Node.removeChild')) {
            console.warn('Error stopping web fallback on close:', error);
          }
        });
        setUseWebFallback(false);
      }
    }
  }, [visible, user, sendCameraEvent]);

  // Check permissions after admin check completes
  useEffect(() => {
    if (visible && user && !adminCheckLoading && isUserAdmin) {
      checkPermissionStatus();
    }
  }, [visible, user, adminCheckLoading, isUserAdmin]);

  // While the web permission screen is visible, follow the browser's own
  // camera signals so enabling the camera from the address bar resumes the
  // scanner without a page reload. Unsupported browsers never fire.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || hasPermission !== false) return;

    const unsubscribe = cameraPermissionManager.watchWebPermission((result: CameraPermissionResult) => {
      if (result.status === 'granted') {
        setCameraError(null);
        setHasPermission(true);
        sendCameraEvent({ type: 'PERMISSION_GRANTED' });
      } else if (result.status === 'blocked') {
        setCameraError(result.message ?? null);
        sendCameraEvent({ type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: false });
      }
    });

    return () => unsubscribe();
    // hasPermission is intentionally read only to (re)arm the watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hasPermission === false, sendCameraEvent]);

  // OLD WEB FALLBACK CODE - DISABLED - We now use WebQRScanner component instead
  // This useEffect is disabled because we're using WebQRScanner on web platform
  // useEffect(() => {
  //   if (Platform.OS === 'web' && visible && hasPermission === true && !useWebFallback && !adminCheckLoading && isUserAdmin) {
  //     // Disabled - using WebQRScanner instead
  //   }
  // }, [visible, hasPermission, useWebFallback, adminCheckLoading, isUserAdmin]);

  const checkPermissionStatus = async () => {
    try {
      sendCameraEvent({ type: 'CHECK' });
      const result = await cameraPermissionManager.getPermissionStatus(true); // Force refresh
      const granted = result.status === 'granted';
      setHasPermission(granted);
      sendCameraEvent(granted
        ? { type: 'PERMISSION_GRANTED' }
        : { type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: result.canAskAgain });
      if (granted && Platform.OS !== 'web') {
        sendCameraEvent({ type: 'START' });
        sendCameraEvent({ type: 'SCANNING' });
      }
      
      // If permission is granted, set camera ready after a very short delay
      if (granted) {
        // Give camera minimal time to initialize, then show it
        setTimeout(() => {
          setCameraReady(true);
        }, 500); // Reduced to 500ms
      } else if (result.canAskAgain && Platform.OS !== 'web') {
        // Native permission prompts can be requested on mount. Browsers only
        // allow getUserMedia from a user gesture, so web waits for the Grant
        // Permission button instead of silently consuming the prompt.
        requestCameraPermission();
      }
    } catch (error) {
      console.error('Error checking permission status:', error);
      sendCameraEvent({ type: 'ERROR', message: 'Unable to check camera permission.' });
      // Fallback to requesting
      requestCameraPermission();
    }
  };

  const checkAdminStatus = async () => {
    if (!user) {
      setAdminCheckLoading(false);
      setIsUserAdmin(false);
      return;
    }
    try {
      setAdminCheckLoading(true);
      // The signed-in user can come from Directus/Better Auth. Its provider
      // ID is not necessarily the Supabase auth UUID used by user_roles, so
      // querying user_roles directly with user.id incorrectly denies admins.
      // Use the same provider-aware endpoint as the admin dashboard instead.
      const access = await getCurrentAdminAccess();
      const admin = Boolean(access.globalRole) || access.eventRoles.length > 0;
      setIsUserAdmin(admin);
    } catch (error) {
      console.error('❌ Error checking admin status:', error);
      setIsUserAdmin(false);
    } finally {
      setAdminCheckLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    try {
      sendCameraEvent({ type: 'REQUEST' });
      // Use permission manager for better handling
      const result = await cameraPermissionManager.requestWithFallback(true); // Force fresh
      
      if (result.status === 'granted') {
        setHasPermission(true);
        sendCameraEvent({ type: 'PERMISSION_GRANTED' });
        sendCameraEvent({ type: 'START' });
        sendCameraEvent({ type: 'SCANNING' });
        // Set camera ready after permission is granted
        setTimeout(() => {
          setCameraReady(true);
        }, 500); // Reduced to 500ms
      } else if (result.status === 'blocked' || (result.status === 'denied' && !result.canAskAgain)) {
        // Permission is blocked - show settings option
        setHasPermission(false);
        sendCameraEvent({ type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: false });
      } else {
        setHasPermission(false);
        sendCameraEvent({ type: 'PERMISSION_REQUIRED', message: result.message, canAskAgain: result.canAskAgain });
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
      sendCameraEvent({ type: 'ERROR', message: error instanceof Error ? error.message : 'Unable to access the camera.' });
    }
  };

  const initializeWebFallback = async () => {
    if (Platform.OS !== 'web' || !hasPermission) return;
    
    try {
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
        setCameraError('Failed to initialize camera - wrapper not found');
        return;
      }

      // Ensure wrapper has ID and attributes
      if (!wrapper.id) {
        wrapper.id = 'scanner-wrapper';
      }
      wrapper.setAttribute('data-testid', 'scanner-wrapper');
      wrapper.className = 'scanner-wrapper';
      
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
          setCameraError(error.message || 'Camera scan error');
        }
      );

      if (result.success) {
        setUseWebFallback(true);
        setCameraReady(true);
        
        // Store cleanup function for later use
        scannerCleanupRef.current = async () => {
          try {
            await qrScannerService.stopWebFallback();
          } catch (error: any) {
            // Suppress DOM errors
            const errorMsg = error?.message || String(error);
            if (!errorMsg.includes('removeChild') && !errorMsg.includes('not a child')) {
              console.warn('Error during scanner cleanup:', error);
            }
          }
        };
        
        // Force a small delay to ensure video element is rendered and visible
        // Use wrapper ID to find it again (wrapper variable is out of scope)
        const wrapperId = wrapper.id;
        setTimeout(() => {
          // Find wrapper again by ID
          const wrapperEl = document.getElementById(wrapperId) ||
                           document.querySelector(`[data-testid="scanner-wrapper"]`) as HTMLElement;
          
          if (!wrapperEl) {
            console.warn('⚠️ Wrapper not found in setTimeout');
            return;
          }
          
          // Check if video element exists
          const videoEl = wrapperEl.querySelector('video') as HTMLVideoElement;
          if (videoEl) {
            // Ensure video is visible and properly styled
            videoEl.style.display = 'block';
            videoEl.style.visibility = 'visible';
            videoEl.style.opacity = '1';
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.objectFit = 'cover';
            videoEl.style.position = 'absolute';
            videoEl.style.top = '0';
            videoEl.style.left = '0';
            videoEl.style.zIndex = '1';
            videoEl.style.backgroundColor = '#000';
            
            // Ensure the wrapper doesn't cover the video
            if (wrapperEl.style) {
              wrapperEl.style.backgroundColor = 'transparent';
              wrapperEl.style.position = 'relative';
              wrapperEl.style.overflow = 'hidden';
            }
            
            // Check video status
            const hasStream = videoEl.srcObject !== null;
            const isPlaying = !videoEl.paused && !videoEl.ended && videoEl.readyState > 2;
            
            // If video has stream but isn't playing, try to play it
            if (hasStream && !isPlaying) {
              videoEl.play().catch(err => {
                console.error('Error playing video:', err);
              });
            }
          } else {
            console.warn('⚠️ Video element not found after initialization');
          }
        }, 500);
      } else {
        setUseWebFallback(false);
        const permission = await cameraPermissionManager.getPermissionStatus(true);
        setHasPermission(permission.status === 'granted');
        setCameraError(permission.status === 'blocked'
          ? permission.message || 'Camera permission is blocked.'
          : result.error || 'Failed to start camera');
        // Try native scanner as fallback
        if (Platform.OS !== 'web') {
          setUseWebFallback(false);
        }
      }
    } catch (error: any) {
      console.error('Error initializing web fallback:', error);
      setUseWebFallback(false);
    }
  };

  const resetScanner = useCallback(async () => {
    setScanned(false);
    setIsProcessing(false);
    setScanResult(null);
    setResolvedPayload(null);
    setExternalTicketClaim(null);
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
  }, [useWebFallback, hasPermission]);

  // Original event tickets are not HashPass payloads. Ask the backend to
  // inspect the raw value so admins can verify a submitted Blockchain Summit
  // ticket without exposing the source QR to the client database.
  const inspectExternalTicket = useCallback(async (data: string): Promise<ExternalTicketClaimInspection | null> => {
    const inspectionResponse = await apiClient.post(
      '/admin/pass-ticket-claims',
      { action: 'inspect', qrPayload: data },
      { skipEventSegment: true },
    );
    if (!inspectionResponse.success) return null;
    const inspectionPayload = inspectionResponse.data as { data?: ExternalTicketClaimInspection } | ExternalTicketClaimInspection;
    return ('data' in inspectionPayload
      ? inspectionPayload.data
      : inspectionPayload) as ExternalTicketClaimInspection;
  }, []);

  const showExternalInspection = useCallback((inspection: ExternalTicketClaimInspection) => {
    setExternalTicketClaim(inspection);
    setResolvedPayload(null);
    setQrDetails(null);
    setScanResult({
      valid: inspection.valid,
      status: inspection.valid ? 'valid' : 'invalid',
      message: inspection.message || (
        inspection.status === 'converted'
          ? 'This original ticket has already been converted.'
          : inspection.status === 'unregistered'
            ? 'This original ticket has not been submitted for verification.'
            : 'Original ticket QR inspected.'
      ),
      display_data: inspection,
    });
    setShowDetails(true);
    if (onScanSuccess) onScanSuccess({
      valid: inspection.valid,
      status: inspection.valid ? 'valid' : 'invalid',
      message: inspection.message || 'Original ticket QR inspected.',
      display_data: inspection,
    });
  }, [onScanSuccess]);

  const processScanData = useCallback(async (data: string) => {
    const parsed = qrScannerService.parseHashpassPayload(data);
    if (!parsed.isValid || parsed.kind === 'url') {
      const inspection = await inspectExternalTicket(data);
      if (!inspection) {
        throw new Error('Unsupported QR code. Scan a HASHPASS QR or an original event ticket QR.');
      }
      showExternalInspection(inspection);
      return;
    }

    if (parsed.kind !== 'qr_token') {
      const resolved = await resolveHashpassQrPayload(parsed);
      setResolvedPayload(resolved);
      setScanResult({
        valid: resolved.valid,
        status: resolved.valid ? 'valid' : 'invalid',
        message: resolved.message,
        display_data: resolved,
      });
      setShowDetails(true);
      if (resolved.pass?.id) onPassResolved?.(resolved.pass.id);
      if (onScanSuccess) onScanSuccess({
        valid: resolved.valid,
        status: resolved.valid ? 'valid' : 'invalid',
        message: resolved.message,
        display_data: resolved,
      });
      return;
    }

    const token = parsed.token!;
    let result = await qrSystemService.checkQRValidity(token);
    if (!result.valid && result.status === 'invalid') {
      // An original ticket QR can carry a `token` field or `?token=` URL that
      // looks like a HashPass token. The validity check above does not consume
      // anything, so when no native QR matches, see if the value is a
      // submitted external ticket before reporting a plain failure.
      let inspection: ExternalTicketClaimInspection | null = null;
      try {
        inspection = await inspectExternalTicket(data);
      } catch (error) {
        console.warn('External ticket inspection unavailable:', error);
      }
      if (inspection && inspection.status !== 'unregistered') {
        showExternalInspection(inspection);
        return;
      }
    }
    if (result.valid) {
      result = await qrSystemService.validateAndUseQR(token, user?.id, 'admin-scanner');
    }
    setScanResult(result);
    setResolvedPayload(null);
    setExternalTicketClaim(null);
    const qr = await qrSystemService.getQRByToken(token);
    setQrDetails(qr);
    if (qr?.pass_id || qr?.display_data?.pass_number) {
      const passPayload: ParsedHashpassQrPayload = {
        kind: 'pass_id',
        raw: data,
        passId: qr.pass_id,
        hpassId: typeof qr.display_data?.pass_number === 'string' ? qr.display_data.pass_number : undefined,
        isValid: true,
      };
      try {
        const resolved = await resolveHashpassQrPayload(passPayload);
        setResolvedPayload(resolved);
        if (resolved.pass?.id) onPassResolved?.(resolved.pass.id);
      } catch (error) {
        console.warn('Unable to resolve pass identity for QR token:', error);
      }
    }
    setShowDetails(true);
    if (onScanSuccess) onScanSuccess(result);
  }, [inspectExternalTicket, onPassResolved, onScanSuccess, showExternalInspection, user?.id]);

  // Memoize scan callback to prevent unnecessary re-renders of BarCodeScanner
  const scanCallback = useCallback(async ({ data }: BarCodeScannerResult) => {
    if (scanned || isProcessing) return;

    setScanned(true);
    setIsProcessing(true);

    try {
      await processScanData(data);
    } catch (error: any) {
      console.error('Error scanning QR:', error);
      Alert.alert('Error', error.message || 'Error processing QR code', [
        { text: 'Try Again', onPress: resetScanner },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [scanned, isProcessing, processScanData, resetScanner]);

  const errorCallback = useCallback((error: Error) => {
    console.error('QR scan error:', error);
    Alert.alert('Error', error.message || 'Error processing QR code', [
      { text: 'Try Again', onPress: resetScanner },
    ]);
  }, [resetScanner]);

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
            try {
            const result = await apiClient.post('/qr/admin', {
              token: qrDetails.token,
              reason: 'Revoked by admin via scanner',
            }, { skipEventSegment: true });
            if (result.success && (result.data as { success?: boolean }).success !== false) {
              Alert.alert('Success', 'QR code has been revoked');
              setQrDetails((current: QRCode | null) => current ? { ...current, status: 'revoked' } : current);
              setScanResult({
                ...scanResult,
                valid: false,
                status: 'revoked',
                message: 'QR code has been revoked'
              });
            } else {
              Alert.alert('Error', 'Failed to revoke QR code');
              }
            } catch (error: any) {
              console.error('Error revoking QR:', error);
              Alert.alert('Error', error.message || 'Failed to revoke QR code');
            }
          },
        },
      ]
    );
  };

  const handleSuspend = async () => {
    if (!scanResult || !qrDetails || !user) return;

    try {
    const result = await apiClient.post('/qr/admin/suspend', { token: qrDetails.token }, { skipEventSegment: true });
    if (result.success && (result.data as { success?: boolean }).success !== false) {
      Alert.alert('Success', 'QR code has been suspended');
      setQrDetails((current: QRCode | null) => current ? { ...current, status: 'suspended' } : current);
      setScanResult({
        ...scanResult,
        valid: false,
        status: 'suspended',
        message: 'QR code is suspended'
      });
    } else {
      Alert.alert('Error', 'Failed to suspend QR code');
      }
    } catch (error: any) {
      console.error('Error suspending QR:', error);
      Alert.alert('Error', error.message || 'Failed to suspend QR code');
    }
  };

  const handleReactivate = async () => {
    if (!qrDetails || !user) return;
    
    try {
      const result = await apiClient.post('/qr/admin/reactivate', { token: qrDetails.token }, { skipEventSegment: true });
      if (result.success && (result.data as { success?: boolean }).success !== false) {
        Alert.alert('Success', 'QR code has been reactivated');
        setQrDetails((current: QRCode | null) => current ? { ...current, status: 'active' } : current);
        setScanResult({
          ...scanResult!,
          valid: true,
          status: 'valid',
          message: 'QR code is valid'
        });
      } else {
        Alert.alert('Error', 'Failed to reactivate QR code');
      }
    } catch (error: any) {
      console.error('Error reactivating QR:', error);
      Alert.alert('Error', error.message || 'Failed to reactivate QR code');
    }
  };

  const approveExternalTicketClaim = useCallback(() => {
    const claim = externalTicketClaim?.claim;
    if (!claim) return;

    Alert.alert(
      'Create HASHPASS pass',
      `Approve the ${claim.requested_pass_type.toUpperCase()} claim for ticket ending in ${claim.ticket_code_last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              const response = await apiClient.post(
                '/admin/pass-ticket-claims',
                {
                  action: 'approve',
                  claimId: claim.id,
                  passType: claim.requested_pass_type,
                },
                { skipEventSegment: true },
              );
              if (!response.success) throw new Error(response.error || 'Unable to approve this claim');
              const payload = response.data as { data?: { status?: string; pass_id?: string | null } };
              const result = payload.data || {};
              setExternalTicketClaim((current: ExternalTicketClaimInspection | null) => current ? {
                ...current,
                valid: false,
                status: 'converted',
                message: 'The original ticket was converted into a HASHPASS pass.',
                claim: current.claim ? {
                  ...current.claim,
                  status: 'converted',
                  hashpass_pass_id: result.pass_id || current.claim.hashpass_pass_id,
                } : current.claim,
              } : current);
              setScanResult((current: QRScanResult | null) => current ? {
                ...current,
                valid: false,
                status: 'invalid',
                message: 'The original ticket was converted into a HASHPASS pass.',
              } : current);
              Alert.alert('Pass created', 'The verified ticket is now represented by a HASHPASS-managed pass.');
            } catch (error) {
              Alert.alert('Claim not approved', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
    );
  }, [externalTicketClaim]);

  if (!visible) return null;

  // Show loading while checking admin status
  if (adminCheckLoading) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.permissionText}>Checking admin access...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // Only show admin error if check completed and user is not admin
  if (!isUserAdmin) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Ionicons name="shield-outline" size={64} color={typeof colors.error === 'string' ? colors.error : colors.error.main} />
            <Text style={styles.errorTitle}>Admin Access Required</Text>
            <Text style={styles.errorText}>
              You need admin privileges to use the admin QR scanner.
            </Text>
            <Text style={styles.errorText}>
              User ID: {user?.id || 'Unknown'}
            </Text>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

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
            <Text style={styles.errorText}>
              {Platform.OS === 'web' 
                ? 'Please enable camera permissions in your browser settings to scan QR codes.'
                : 'Please enable camera permissions in your device settings to scan QR codes.'}
            </Text>
            {Platform.OS !== 'web' || cameraCanAskAgain ? (
              <TouchableOpacity
                style={styles.button}
                onPress={async () => {
                  await requestCameraPermission();
                }}
              >
                <Text style={styles.buttonText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary]} 
              onPress={async () => {
                const opened = await cameraPermissionManager.openSettings();
                // If on web and settings couldn't be opened, instructions are already shown
                if (!opened && Platform.OS !== 'web') {
                  cameraPermissionManager.showSettingsAlert();
                }
              }}
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

  // Error boundary wrapper to catch DOM removal errors
  const ScannerWrapper = ({ children }: { children: React.ReactNode }) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Wrap in error boundary for web
      return (
        <ErrorBoundary
          fallback={null}
          onError={(error) => {
            // Suppress DOM removal errors
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('removeChild') || 
                errorMsg.includes('not a child') ||
                errorMsg.includes('Node.removeChild')) {
              console.debug('Suppressed DOM removal error in error boundary:', errorMsg);
              return true; // Suppress error
            }
            return false; // Let other errors propagate
          }}
        >
          {children}
        </ErrorBoundary>
      );
    }
    return <>{children}</>;
  };

  // Simple error boundary component
  class ErrorBoundary extends React.Component<
    { children: React.ReactNode; fallback: React.ReactNode; onError?: (error: Error) => boolean },
    { hasError: boolean }
  > {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
      return { hasError: true };
    }

    componentDidCatch(error: Error) {
      if (this.props.onError) {
        const shouldSuppress = this.props.onError(error);
        if (shouldSuppress) {
          // Reset error state if suppressed
          this.setState({ hasError: false });
        }
      }
    }

    render() {
      if (this.state.hasError) {
        return this.props.fallback;
      }
      return this.props.children;
    }
  }

  // Use WebQRScanner on web platform
  if (Platform.OS === 'web' && WebQRScanner) {
    return (
      <>
        <WebQRScanner
          visible={visible}
          onClose={onClose}
          onScanSuccess={async (text: string) => {
            if (scanned || isProcessing) return;
            setScanned(true);
            setIsProcessing(true);
            try {
              await processScanData(text);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error processing QR code', [
                { text: 'Try Again', onPress: resetScanner },
              ]);
              setScanned(false);
            } finally {
              setIsProcessing(false);
            }
          }}
          onError={(error: Error) => {
            setCameraError(error.message);
          }}
          title="Admin QR Scanner"
        />
        
        {/* Show QR details in a separate modal when showDetails is true */}
        {showDetails && scanResult && (
          <Modal visible={showDetails} animationType="slide" transparent>
            <View style={styles.modalContainer}>
              <View style={styles.scannerContainer}>
                <View style={styles.header}>
                  <View style={styles.headerContent}>
                    <Text style={styles.title}>QR Code Details</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => {
                      setShowDetails(false);
                      resetScanner();
                    }} 
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                
                {/* Reuse the existing details view - we'll need to extract it */}
                <ScrollView style={styles.detailsContainer} contentContainerStyle={styles.detailsContent}>
                  <View style={styles.detailsHeader}>
                    <Ionicons 
                      name={scanResult?.valid ? "checkmark-circle" : "close-circle"} 
                      size={48} 
                      color={scanResult?.valid ? colors.success.main : colors.error.main} 
                    />
                    <Text style={styles.detailsTitle}>
                      {scanResult?.valid ? 'Valid QR Code' : 'Invalid QR Code'}
                    </Text>
                    <Text style={styles.detailsStatus}>{scanResult?.message}</Text>
                  </View>

                  {resolvedPayload && (
                    <ScanResultCard resolution={resolvedPayload} mode={isDark ? 'dark' : 'light'} showUsage />
                  )}

                  {externalTicketClaim && (
                    <ExternalClaimReview
                      inspection={externalTicketClaim}
                      mode={isDark ? 'dark' : 'light'}
                      onApprove={approveExternalTicketClaim}
                    />
                  )}

                  {qrDetails && <View style={styles.detailsSection}>
                    <Text style={styles.sectionTitle}>QR Code Details</Text>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Token:</Text>
                      <Text style={styles.detailValue} selectable>{qrDetails.token}</Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Type:</Text>
                      <Text style={styles.detailValue}>{qrDetails.qr_type}</Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status:</Text>
                      <Text style={[styles.detailValue, { color: getStatusColor(qrDetails.status) }]}>
                        {qrDetails.status.toUpperCase()}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Usage:</Text>
                      <Text style={styles.detailValue}>
                        {qrDetails.usage_count} / {qrDetails.max_uses}
                      </Text>
                    </View>
                    
                    {qrDetails.expires_at && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Expires:</Text>
                        <Text style={styles.detailValue}>
                          {new Date(qrDetails.expires_at).toLocaleString()}
                        </Text>
                      </View>
                    )}
                    
                    {qrDetails.display_data && (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Pass Number:</Text>
                          <Text style={styles.detailValue}>
                            {qrDetails.display_data.pass_number || 'N/A'}
                          </Text>
                        </View>
                        {qrDetails.display_data.pass_type && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Pass Type:</Text>
                            <Text style={styles.detailValue}>
                              {qrDetails.display_data.pass_type}
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>}

                  {/* Admin Actions */}
                  {isUserAdmin && qrDetails && (
                    <View style={styles.actionsSection}>
                      {qrDetails.status === 'active' && (
                        <TouchableOpacity style={[styles.actionButton, styles.suspendButton]} onPress={handleSuspend}>
                          <MaterialIcons name="pause-circle-outline" size={20} color="#FF9500" />
                          <Text style={styles.actionButtonText}>Suspend QR</Text>
                        </TouchableOpacity>
                      )}
                      
                      {qrDetails.status === 'suspended' && (
                        <TouchableOpacity 
                          style={[styles.actionButton, { borderColor: typeof colors.success === 'string' ? colors.success : colors.success.main, borderWidth: 1 }]} 
                          onPress={handleReactivate}
                        >
                          <MaterialIcons name="play-circle-outline" size={20} color={typeof colors.success === 'string' ? colors.success : colors.success.main} />
                          <Text style={[styles.actionButtonText, { color: typeof colors.success === 'string' ? colors.success : colors.success.main }]}>Reactivate QR</Text>
                        </TouchableOpacity>
                      )}
                      
                      {qrDetails.status !== 'revoked' && (
                        <TouchableOpacity style={[styles.actionButton, styles.revokeButton]} onPress={handleRevoke}>
                          <MaterialIcons name="block" size={20} color={colors.error.main} />
                          <Text style={[styles.actionButtonText, { color: colors.error.main }]}>Revoke QR</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={styles.buttonGroup}>
                    <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
                      <Text style={styles.resetButtonText}>Scan Another</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.resetButton, styles.closeButtonFull]} onPress={onClose}>
                      <Text style={styles.resetButtonText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <ScannerWrapper>
      <View style={styles.modalContainer}>
        <View style={styles.scannerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Admin QR Scanner</Text>
              <Text style={styles.description}>Scan QR codes with admin controls</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {!showDetails ? (
            <>
              {/* Scanner View - Always render wrapper for web fallback */}
              <View 
                style={styles.scannerWrapper} 
                ref={scannerWrapperRef}
                // @ts-ignore - Web-specific attributes
                data-testid="scanner-wrapper"
                // @ts-ignore
                className="scanner-wrapper"
              >
                {hasPermission === true && (
                  <>
                    {!useWebFallback ? (
                <BarCodeScanner
                        onBarCodeScanned={scanned || isProcessing ? undefined : handleBarCodeScanned}
                        style={[StyleSheet.absoluteFillObject, styles.cameraView]}
                  barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
                        type="back"
                      />
                    ) : (
                      // Web fallback - ZXing will create video element inside wrapper
                      Platform.OS === 'web' && null
                    )}
                    {/* Only show loading overlay briefly, then hide it to show camera */}
                    {!cameraReady && !cameraError && hasPermission === true && (
                      <View style={[styles.cameraLoadingOverlay, { pointerEvents: "none" }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.cameraLoadingText}>Starting camera...</Text>
                      </View>
                    )}
                    {cameraError && (
                      <View style={styles.cameraErrorOverlay}>
                        <Ionicons name="camera-outline" size={64} color={colors.error.main} />
                        <Text style={styles.cameraErrorText}>Camera Error</Text>
                        <Text style={styles.cameraErrorDetails}>{cameraError}</Text>
                        <TouchableOpacity
                          style={styles.retryButton}
                          onPress={() => {
                            setCameraError(null);
                            setCameraReady(false);
                            setHasPermission(null);
                            setTimeout(() => {
                              checkPermissionStatus();
                            }, 500);
                          }}
                        >
                          <Text style={styles.retryButtonText}>Retry</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
                {hasPermission !== null && !hasPermission ? (
                  <View style={styles.scannerPlaceholder}>
                    <Ionicons name="camera-outline" size={64} color={colors.text.secondary} />
                    <Text style={styles.placeholderText}>Camera permission required</Text>
                  </View>
                ) : null}

                {/* Overlay - only show when camera is ready, pointerEvents none to not block camera */}
                {cameraReady && hasPermission === true && (
                  <View style={[styles.overlay, { pointerEvents: "none" }]}>
                  <View style={styles.overlayTop} />
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
                  <View style={styles.overlayBottom}>
                    {isProcessing && (
                      <View style={styles.processingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.processingText}>Processing...</Text>
                      </View>
                    )}
                  </View>
                </View>
                )}
              </View>

              {/* Instructions */}
              <View style={styles.instructions}>
                <Text style={styles.instructionText}>
                  Position the QR code within the frame to scan
                </Text>
                {scanned && !isProcessing && !showDetails && (
                  <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
                    <Text style={styles.resetButtonText}>Scan Again</Text>
                  </TouchableOpacity>
                )}
                {isProcessing && (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.processingText}>Processing QR code...</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            /* QR Details View */
            <ScrollView style={styles.detailsContainer} contentContainerStyle={styles.detailsContent}>
              <View style={styles.detailsHeader}>
                <Ionicons 
                  name={scanResult?.valid ? "checkmark-circle" : "close-circle"} 
                  size={48} 
                  color={scanResult?.valid ? colors.success.main : colors.error.main} 
                />
                <Text style={styles.detailsTitle}>
                  {scanResult?.valid ? 'Valid QR Code' : 'Invalid QR Code'}
                </Text>
                <Text style={styles.detailsStatus}>{scanResult?.message}</Text>
              </View>

              {resolvedPayload && (
                <ScanResultCard resolution={resolvedPayload} mode={isDark ? 'dark' : 'light'} showUsage />
              )}

              {externalTicketClaim && (
                <ExternalClaimReview
                  inspection={externalTicketClaim}
                  mode={isDark ? 'dark' : 'light'}
                  onApprove={approveExternalTicketClaim}
                />
              )}

              {qrDetails && (
                <View style={styles.detailsSection}>
                  <Text style={styles.sectionTitle}>QR Code Details</Text>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Token:</Text>
                    <Text style={styles.detailValue} selectable>{qrDetails.token}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>{qrDetails.qr_type}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={[styles.detailValue, { color: getStatusColor(qrDetails.status) }]}>
                      {qrDetails.status.toUpperCase()}
                    </Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Usage:</Text>
                    <Text style={styles.detailValue}>
                      {qrDetails.usage_count} / {qrDetails.max_uses}
                    </Text>
                  </View>
                  
                  {qrDetails.expires_at && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Expires:</Text>
                      <Text style={styles.detailValue}>
                        {new Date(qrDetails.expires_at).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  
                  {qrDetails.pass_id && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Pass ID:</Text>
                      <Text style={styles.detailValue} selectable>{qrDetails.pass_id}</Text>
                    </View>
                  )}
                  
                  {qrDetails.display_data && (
                    <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Pass Number:</Text>
                      <Text style={styles.detailValue}>
                        {qrDetails.display_data.pass_number || 'N/A'}
                        </Text>
                      </View>
                      {qrDetails.display_data.pass_type && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Pass Type:</Text>
                          <Text style={styles.detailValue}>
                            {qrDetails.display_data.pass_type}
                      </Text>
                    </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {scanResult && !scanResult.valid && (
                <View style={styles.detailsSection}>
                  <Text style={styles.sectionTitle}>Validation Error</Text>
                  <Text style={[styles.detailValue, { color: typeof colors.error === 'string' ? colors.error : colors.error.main }]}>
                    {scanResult.message}
                  </Text>
                </View>
              )}

              {/* Admin Actions */}
              {qrDetails && (
                <View style={styles.actionsSection}>
                  <Text style={styles.sectionTitle}>Admin Actions</Text>
                  
                  {/* Pass Upgrade Action */}
                  {qrDetails.pass_id && qrDetails.display_data?.pass_type && (
                    <View style={styles.passUpgradeSection}>
                      <Text style={styles.sectionSubtitle}>Upgrade Pass</Text>
                      <Text style={styles.detailValue}>
                        Current: {qrDetails.display_data.pass_type.toUpperCase()}
                      </Text>
                      <View style={styles.upgradeButtons}>
                        {(['general', 'business', 'vip'] as PassType[]).map((type) => {
                          if (type === qrDetails.display_data?.pass_type) return null;
                          return (
                            <TouchableOpacity
                              key={type}
                              style={[styles.upgradeButton, { borderColor: colors.primary }]}
                              onPress={async () => {
                                if (!qrDetails.pass_id || !user) return;
                                Alert.alert(
                                  'Upgrade Pass',
                                  `Upgrade pass to ${type.toUpperCase()}?`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Upgrade',
                                      onPress: async () => {
                                        try {
                                          const eventId = resolvedPayload?.pass?.eventId ||
                                            qrDetails.qr_data?.eventId ||
                                            qrDetails.qr_data?.event_id ||
                                            qrDetails.display_data?.eventId ||
                                            qrDetails.display_data?.event_id;
                                          if (typeof eventId !== 'string' || !eventId) {
                                            throw new Error('The pass event could not be determined.');
                                          }

                                          const update = await apiClient.post('/admin/passes', {
                                            action: 'update',
                                            eventId,
                                            passId: qrDetails.pass_id,
                                            passType: type,
                                          }, { skipEventSegment: true });
                                          if (!update.success) throw new Error(update.error);
                                          
                                          Alert.alert('Success', `Pass upgraded to ${type.toUpperCase()}`);
                                          
                                          setQrDetails((current: QRCode | null) => current ? {
                                            ...current,
                                            display_data: { ...(current.display_data || {}), pass_type: type },
                                          } : current);
                                        } catch (error: any) {
                                          console.error('Error upgrading pass:', error);
                                          Alert.alert('Error', error.message || 'Failed to upgrade pass');
                                        }
                                      }
                                    }
                                  ]
                                );
                              }}
                            >
                              <Text style={[styles.upgradeButtonText, { color: colors.primary }]}>
                                Upgrade to {type.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  
                  {/* QR Status Actions */}
                  <Text style={styles.sectionSubtitle}>QR Status Actions</Text>
                  
                  {qrDetails.status === 'active' && (
                  <TouchableOpacity style={[styles.actionButton, styles.suspendButton]} onPress={handleSuspend}>
                    <MaterialIcons name="pause-circle-outline" size={20} color="#FF9500" />
                    <Text style={styles.actionButtonText}>Suspend QR</Text>
                  </TouchableOpacity>
                  )}
                  
                  {qrDetails.status === 'suspended' && (
                    <TouchableOpacity 
                      style={[styles.actionButton, { borderColor: typeof colors.success === 'string' ? colors.success : colors.success.main, borderWidth: 1 }]} 
                      onPress={handleReactivate}
                    >
                      <MaterialIcons name="play-circle-outline" size={20} color={typeof colors.success === 'string' ? colors.success : colors.success.main} />
                      <Text style={[styles.actionButtonText, { color: typeof colors.success === 'string' ? colors.success : colors.success.main }]}>Reactivate QR</Text>
                    </TouchableOpacity>
                  )}
                  
                  {qrDetails.status !== 'revoked' && (
                  <TouchableOpacity style={[styles.actionButton, styles.revokeButton]} onPress={handleRevoke}>
                      <MaterialIcons name="block" size={20} color={colors.error.main} />
                      <Text style={[styles.actionButtonText, { color: colors.error.main }]}>Revoke QR</Text>
                  </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
                  <Text style={styles.resetButtonText}>Scan Another</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resetButton, styles.closeButtonFull]} onPress={onClose}>
                  <Text style={styles.resetButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
      </ScannerWrapper>
    </Modal>
  );
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active': return '#34A853';
    case 'used': return '#8E8E93';
    case 'expired': return '#FF9500';
    case 'revoked': return '#FF3B30';
    case 'suspended': return '#FF9500';
    default: return '#8E8E93';
  }
};

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
    errorText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 8,
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
    detailsContainer: {
      flex: 1,
      backgroundColor: colors.background.paper,
    },
    detailsContent: {
      padding: 20,
    },
    detailsHeader: {
      alignItems: 'center',
      marginBottom: 24,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailsTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginTop: 12,
      marginBottom: 8,
    },
    detailsStatus: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    detailsSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    detailValue: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
    },
    actionsSection: {
      marginBottom: 24,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
      backgroundColor: colors.background.secondary,
    },
    suspendButton: {
      borderWidth: 1,
      borderColor: '#FF9500',
    },
    revokeButton: {
      borderWidth: 1,
      borderColor: colors.error.main,
    },
    actionButtonText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    buttonGroup: {
      flexDirection: 'row',
      gap: 12,
    },
    closeButtonFull: {
      backgroundColor: colors.background.secondary,
      flex: 1,
    },
    scannerPlaceholder: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    placeholderText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    sectionSubtitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
      marginTop: 8,
      marginBottom: 8,
    },
    passUpgradeSection: {
      marginBottom: 16,
      padding: 12,
      backgroundColor: colors.background.secondary,
      borderRadius: 8,
    },
    upgradeButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    upgradeButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
      borderWidth: 1,
      backgroundColor: colors.background.paper,
    },
    upgradeButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    cameraLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    },
    cameraLoadingText: {
      marginTop: 16,
      fontSize: 16,
      color: '#FFFFFF',
      textAlign: 'center',
    },
    cameraErrorOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      zIndex: 10,
    },
    cameraErrorText: {
      marginTop: 16,
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.error.main,
      textAlign: 'center',
    },
    cameraErrorDetails: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
