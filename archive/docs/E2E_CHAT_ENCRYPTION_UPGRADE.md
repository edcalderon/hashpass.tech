# E2E Chat Encryption Upgrade: Key Backup & Restore

> Archived implementation record. The active meeting-chat reference lives in
> [`apps/docs/docs/reference/mobile-app/e2e-meeting-chat.md`](../../apps/docs/docs/reference/mobile-app/e2e-meeting-chat.md).

**Date:** 2026-10-03  
**Status:** Implemented  
**Migration:** V075__chat_key_backup_restore.sql

## Problem

The previous E2E encryption design (V053) was single-device by deliberate product decision: each user held a device-local X25519 keypair (private key in SecureStore/localStorage only), and the public key was published to `user_chat_keys`. When a user reinstalled the app or switched devices:

1. A new keypair was generated
2. The new public key replaced the old one in `user_chat_keys`
3. All previous messages became permanently undecryptable ("[Unable to decrypt this message]")

This is what caused the issue shown in the screenshot where messages appeared as encrypted/garbled text.

## Solution

Added optional encrypted key backup/restore while maintaining E2E security:

### Security Properties
- **Server never sees plaintext keys or passwords**: The private key is encrypted client-side with a user-provided password before being uploaded
- **Encryption**: XChaCha20-Poly1305 with HKDF-SHA256 key derivation (32-byte key, 16-byte salt)
- **Backup is optional**: Users who don't set up backup retain the old single-device behavior
- **No password reset**: If the user forgets their backup password, the backup is unrecoverable (by design)
- **Key rotation clears backup**: Publishing a new public key automatically clears the encrypted backup, forcing the user to create a new one if they want backup again

### Database Changes (V075)

Added three new columns to `user_chat_keys`:
- `encrypted_private_key_backup` (text): The encrypted private key (hex-encoded nonce:ciphertext)
- `backup_salt` (text): 16-byte salt for password-based key derivation (hex-encoded)
- `backup_created_at` (timestamptz): When the backup was created

New RPCs:
- `store_chat_key_backup(user_id, encrypted_private_key, salt)`: Store/update the encrypted backup
- `get_chat_key_backup(user_id)`: Retrieve the encrypted backup (own user only)
- `delete_chat_key_backup(user_id)`: Delete the backup (key rotation or opt-out)

Modified RPC:
- `publish_user_chat_public_key` now clears the encrypted backup when a new public key is published (key rotation)

### Client-Side Changes

#### `lib/chat-encryption.ts`
- `encryptPrivateKeyForBackup(privateKey, password)`: Encrypts the private key with a password, returns `{ encryptedKey, salt }`
- `decryptPrivateKeyFromBackup(encryptedKey, salt, password)`: Decrypts the private key, returns `null` on wrong password
- `backupChatKeyPair(userId, password)`: Encrypts and uploads the backup to Supabase
- `restoreChatKeyPair(userId, password)`: Fetches and decrypts the backup, writes it to device storage
- `hasChatKeyBackup(userId)`: Checks if a backup exists
- `deleteChatKeyBackup(userId)`: Deletes the backup

#### `hooks/useRealtimeChat.ts`
- New state: `needsKeyRestore` — true when device has no local key but a backup exists
- New functions: `restoreKeyFromBackup(password)`, `skipKeyRestore()`, `createKeyBackup(password)`
- `setupKeys()` now checks for a backup when initializing and sets `needsKeyRestore` if one exists

#### `components/RealtimeChat.tsx`
- **Restore Modal**: Shown when `needsKeyRestore` is true — prompts for backup password to restore chat history
- **Setup Modal**: Shown after successful restore (optional) — prompts user to create a new backup for future device restores
- Both modals are non-blocking (users can skip)

## User Flow

### First Time Setup (New User)
1. User opens chat for the first time
2. `ensureChatKeyPair()` generates a new keypair and publishes the public key
3. Chat works normally — no backup exists yet
4. *(Future enhancement: optionally prompt user to create a backup)*

### New Device / Reinstall (With Backup)
1. User opens chat
2. `ensureChatKeyPair()` generates a new keypair (no local key exists)
3. `hasChatKeyBackup()` finds an existing backup → sets `needsKeyRestore = true`
4. **Restore Modal appears**: "You have an encrypted backup of your chat history. Enter your backup password to restore it."
5. User enters password → `restoreKeyFromBackup()` fetches + decrypts + writes to SecureStore
6. Messages are re-decrypted with the restored key — chat history is visible!
7. **Setup Modal appears** (optional): "Create an encrypted backup of your chat key so you can restore your messages on a new device."
8. User can create a new backup or skip

### New Device / Reinstall (Without Backup)
1. User opens chat
2. `ensureChatKeyPair()` generates a new keypair
3. `hasChatKeyBackup()` finds no backup → `needsKeyRestore = false`
4. Chat works normally — but old messages show as "[Unable to decrypt this message]"
5. *(Future enhancement: optionally prompt user to create a backup for future restores)*

### Key Rotation
1. User publishes a new public key (e.g., after manually rotating keys)
2. `publish_user_chat_public_key` clears `encrypted_private_key_backup`, `backup_salt`, `backup_created_at`
3. Next time user opens chat on any device, no backup exists → old messages are unrecoverable
4. *(Future enhancement: automatically prompt user to create a new backup)*

## Migration Path

For existing users:
- **No immediate action needed**: The old behavior is preserved for users who don't have a backup
- **Gradual rollout**: As users reinstall or switch devices, they'll be prompted to restore (if they have a backup) or continue without one
- **Future enhancement**: Add a one-time prompt for existing users to create a backup before they lose access

## Testing

1. **New user flow**: Create a new account, open chat, verify keypair is generated and public key is published
2. **Backup flow**: After sending messages, create a backup with a password, verify it's stored in `user_chat_keys`
3. **Restore flow**: Clear local storage (simulate new device), reopen chat, verify restore modal appears, enter password, verify messages are decrypted
4. **Wrong password**: Try restoring with wrong password, verify error message is shown
5. **Skip restore**: Skip the restore prompt, verify new keypair is used and old messages show as undecryptable
6. **Key rotation**: Publish a new public key, verify backup is cleared

## Future Enhancements

1. **Proactive backup prompt**: After first message, prompt user to create a backup (not just after restore)
2. **Backup status indicator**: Show a badge/icon when backup is enabled
3. **Backup password change**: Allow changing the backup password (re-encrypt with new password)
4. **Multiple backups**: Store multiple encrypted backups (e.g., with different passwords) for redundancy
5. **Automatic backup**: Optionally auto-backup after N messages or M days

## Security Considerations

- **Password strength**: The security of the backup depends entirely on the password strength. Weak passwords can be brute-forced offline (the encrypted backup is public).
- **No server-side validation**: The server cannot verify the password or the decrypted key — it just stores and returns the encrypted blob.
- **Backup is optional**: Users who don't trust the backup mechanism can skip it entirely and retain the old single-device behavior.
- **No key escrow**: The server cannot decrypt the backup without the user's password — this is true E2E encryption, not server-side key escrow.
