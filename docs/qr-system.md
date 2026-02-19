# Comprehensive QR Code System

## Overview

This document describes the comprehensive QR code system implemented for Hashpass. The system provides dynamic QR code generation, double-spend prevention, admin controls, and is designed to be agnostic for future wallet crypto transfers.

## Features

### ✅ Core Features

1. **Dynamic QR Generation**
   - Each pass generates unique, time-limited QR codes
   - QR codes expire after a configurable time (default: 30 minutes)
   - Automatic refresh mechanism prevents stale QR codes

2. **Double-Spend Prevention**
   - Each QR code can only be used once (configurable)
   - Database-level validation prevents reuse
   - Usage tracking and audit logs

3. **Admin Controls**
   - Admins can revoke QR codes at any time
   - Suspend QR codes temporarily
   - Reactivate revoked/suspended QR codes
   - View all QR codes and scan logs

4. **Wallet-Agnostic Design**
   - Supports multiple QR types: `pass`, `wallet_transfer`, `access_code`, `ticket`
   - Extensible for future crypto wallet integrations
   - Flexible JSON payload system

5. **Integrated Scanner**
   - QR scanner integrated in navbar
   - Real-time validation feedback
   - Error handling and user feedback

## Architecture

### Database Schema

#### `qr_codes` Table
- Stores all QR code records
- Fields:
  - `token`: Unique dynamic token
  - `qr_type`: Type of QR (pass, wallet_transfer, etc.)
  - `pass_id`: Associated pass (nullable)
  - `user_id`: Owner of the QR
  - `status`: active, used, expired, revoked, suspended
  - `expires_at`: Expiration timestamp
  - `usage_count`: Number of times scanned
  - `max_uses`: Maximum allowed uses (default: 1)
  - Admin fields: `revoked_by`, `revoked_at`, `revoked_reason`

#### `qr_scan_logs` Table
- Audit trail for all QR scans
- Tracks scanner information, scan results, and timestamps

### Database Functions

1. **`generate_qr_token()`**: Generates unique QR tokens
2. **`generate_pass_qr()`**: Creates a dynamic QR for a pass
3. **`validate_and_use_qr()`**: Validates and marks QR as used (prevents double spending)
4. **`revoke_qr_code()`**: Admin function to revoke QR codes
5. **`suspend_qr_code()`**: Admin function to suspend QR codes
6. **`reactivate_qr_code()`**: Admin function to reactivate QR codes

### Service Layer (`lib/qr-system.ts`)

The `QRSystemService` class provides:
- `generatePassQR()`: Generate QR for a pass
- `validateAndUseQR()`: Validate and use QR (prevents double spending)
- `checkQRValidity()`: Check validity without using
- `revokeQR()`: Admin revoke
- `suspendQR()`: Admin suspend
- `reactivateQR()`: Admin reactivate
- `getQRScanLogs()`: Get scan history
- `generateWalletTransferQR()`: Generate wallet transfer QR (future)

### Components

1. **`QRScanner`** (`components/QRScanner.tsx`)
   - Full-screen QR scanner modal
   - Camera permission handling
   - Real-time validation
   - Success/error feedback

2. **`DynamicQRDisplay`** (`components/DynamicQRDisplay.tsx`)
   - Displays dynamic QR codes for passes
   - Auto-refresh functionality
   - Expiry countdown timer
   - Status indicators

### API Endpoints

All endpoints require admin authentication:

- `GET /api/qr/admin` - List all QR codes (with filters)
- `POST /api/qr/admin` - Revoke a QR code
- `POST /api/qr/admin/suspend` - Suspend a QR code
- `POST /api/qr/admin/reactivate` - Reactivate a QR code
- `GET /api/qr/admin/logs` - Get QR scan logs

## Usage

### For Users

1. **View Pass QR Code**
   - Navigate to dashboard
   - Click "QR Code" button on pass card
   - QR code displays with auto-refresh

2. **Scan QR Code**
   - Click QR scanner icon in navbar
   - Point camera at QR code
   - Validation happens automatically

### For Admins

1. **Manage QR Codes**
   ```typescript
   // Revoke a QR code
   await qrSystemService.revokeQR(token, adminUserId, reason);
   
   // Suspend a QR code
   await qrSystemService.suspendQR(token, adminUserId);
   
   // Reactivate a QR code
   await qrSystemService.reactivateQR(token, adminUserId);
   ```

2. **View QR Codes**
   ```typescript
   // Get all QR codes
   const qrCodes = await qrSystemService.getUserQRCodes(userId);
   
   // Get scan logs
   const logs = await qrSystemService.getQRScanLogs(qrCodeId);
   ```

## Integration Points

### Navbar Scanner
- Located in `app/(shared)/dashboard/_layout.tsx`
- QR scanner button opens full-screen scanner
- Integrated with `QRScanner` component

### Pass Display
- Located in `components/PassesDisplay.tsx`
- "QR Code" button opens modal with `DynamicQRDisplay`
- Each pass has its own dynamic QR

## Security Features

1. **Double-Spend Prevention**
   - Database-level checks prevent QR reuse
   - Atomic operations ensure data consistency
   - Usage count tracking

2. **Expiration**
   - QR codes expire after 30 minutes (configurable)
   - Automatic status updates
   - Expired QRs cannot be used

3. **Admin Controls**
   - Only admins can revoke/suspend QRs
   - Full audit trail in scan logs
   - Revocation reasons tracked

4. **Rate Limiting**
   - API endpoints have rate limiting
   - Prevents abuse and DDoS

## Future Enhancements

### Wallet Integration
The system is designed to support wallet QR codes for crypto transfers:

```typescript
// Generate wallet transfer QR
const walletQR = await qrSystemService.generateWalletTransferQR(
  userId,
  walletAddress,
  amount,
  currency
);
```

### Additional Features
- QR code analytics dashboard
- Bulk QR operations
- Custom QR expiration rules per pass type
- QR code templates and branding

## Migration

To set up the QR system:

1. **Run Database Migration**
   ```bash
   # The migration file is at:
   # supabase/migrations/20250120000000_create_qr_system.sql
   ```

2. **Verify Installation**
   - Check that tables are created
   - Verify functions are available
   - Test QR generation

3. **Configure Admin Roles**
   - Set up `user_roles` table if not exists
   - Assign admin role to users who need QR management

## Troubleshooting

### QR Codes Not Generating
- Check user authentication
- Verify pass exists and is active
- Check database connection
- Review error logs

### Scanner Not Working
- Verify camera permissions
- Check `expo-barcode-scanner` installation
- Test on physical device (simulators may not support camera)

### Admin API Access Denied
- Verify admin role in `user_roles` table
- Check authentication token
- Verify API endpoint authorization logic

## API Examples

### Generate QR Code
```typescript
const result = await qrSystemService.generatePassQR(passId, {
  expiresInMinutes: 30,
  maxUses: 1
});
```

### Validate QR Code
```typescript
const result = await qrSystemService.validateAndUseQR(token, scannerUserId);
if (result.valid) {
  // QR is valid and has been marked as used
  console.log(result.qr_data);
} else {
  // QR is invalid, expired, or already used
  console.error(result.message);
}
```

### Admin: List QR Codes
```bash
curl -X GET "https://api.example.com/api/qr/admin?status=active&page=1" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Admin: Revoke QR Code
```bash
curl -X POST "https://api.example.com/api/qr/admin" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "QR-1234-5678", "reason": "Lost device"}'
```

## Best Practices

1. **QR Expiration**: Keep expiration times reasonable (15-60 minutes)
2. **Auto-Refresh**: Enable auto-refresh for better UX
3. **Error Handling**: Always handle validation errors gracefully
4. **Admin Actions**: Log all admin actions for audit purposes
5. **Rate Limiting**: Implement rate limiting on QR generation

## Support

For issues or questions:
- Check database logs for errors
- Review scan logs for validation issues
- Verify RLS policies are correctly configured
- Test with different user roles

