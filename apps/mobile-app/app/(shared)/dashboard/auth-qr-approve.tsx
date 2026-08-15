import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AuthQrApprovalCard } from '../../../components/AuthQrApprovalCard';

// Reached by scanning a HashPass Auth QR code (see lib/auth-qr.ts and the
// onRawScan wiring in _layout.tsx's QRScanner usages). The browser that
// showed the QR code is polling the API for this decision -- see
// packages/hashpass-links-api/src/routes/auth-qr.ts's approveChallenge().
export default function AuthQrApproveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;

  return (
    <AuthQrApprovalCard
      challengeId={challengeId}
      onApproved={() => router.back()}
      onDenied={() => router.back()}
      onCancel={() => router.back()}
      onInvalidAction={() => router.back()}
    />
  );
}
