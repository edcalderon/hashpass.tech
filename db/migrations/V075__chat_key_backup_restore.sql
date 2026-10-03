-- Adds encrypted private key backup support to the E2E chat encryption
-- system, allowing users to restore their chat history on new devices or
-- after reinstalling.
--
-- The previous design (V053) stored only the public key in user_chat_keys
-- and kept the private key device-local (SecureStore/localStorage only).
-- This meant losing the device or reinstalling permanently lost the ability
-- to decrypt prior messages.
--
-- New design: users can optionally back up their private key, encrypted
-- with a password they provide. The encrypted backup is stored server-side
-- in user_chat_keys.encrypted_private_key_backup. The encryption uses
-- XChaCha20-Poly1305 with a key derived from the password via HKDF-SHA256
-- (32-byte key, 16-byte salt stored alongside). The server never sees the
-- plaintext private key or the password.
--
-- On a new device, users can restore by entering their backup password.
-- The client fetches the encrypted backup + salt, derives the same key,
-- decrypts the private key, and writes it to SecureStore/localStorage.
--
-- Security properties:
-- - Server cannot decrypt the backup without the user's password
-- - Backup is optional — users who don't set it up retain the old behavior
-- - If the user forgets their backup password, the backup is unrecoverable
--   (by design — no password reset for E2E encryption keys)
-- - Publishing a new public key (e.g. after key rotation) clears the
--   encrypted backup, forcing the user to create a new one if they want
--   backup again

ALTER TABLE public.user_chat_keys
  ADD COLUMN IF NOT EXISTS encrypted_private_key_backup text,
  ADD COLUMN IF NOT EXISTS backup_salt text,
  ADD COLUMN IF NOT EXISTS backup_created_at timestamptz;

-- RPC: Store encrypted private key backup
DROP FUNCTION IF EXISTS public.store_chat_key_backup(uuid, text, text);
CREATE OR REPLACE FUNCTION public.store_chat_key_backup(
  p_user_id uuid,
  p_encrypted_private_key text,
  p_salt text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_encrypted_private_key, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_encrypted_key');
  END IF;

  IF length(coalesce(p_salt, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_salt');
  END IF;

  -- User must already have a public key published (can't backup without setup)
  IF NOT EXISTS (SELECT 1 FROM public.user_chat_keys WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_key_pair');
  END IF;

  UPDATE public.user_chat_keys
  SET
    encrypted_private_key_backup = p_encrypted_private_key,
    backup_salt = p_salt,
    backup_created_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: Retrieve encrypted private key backup
DROP FUNCTION IF EXISTS public.get_chat_key_backup(uuid);
CREATE OR REPLACE FUNCTION public.get_chat_key_backup(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted_key text;
  v_salt text;
  v_created_at timestamptz;
BEGIN
  -- Users can only retrieve their own backup
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT encrypted_private_key_backup, backup_salt, backup_created_at
  INTO v_encrypted_key, v_salt, v_created_at
  FROM public.user_chat_keys
  WHERE user_id = p_user_id;

  IF v_encrypted_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_backup');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'encrypted_private_key', v_encrypted_key,
    'salt', v_salt,
    'created_at', v_created_at
  );
END;
$$;

-- RPC: Delete encrypted private key backup (key rotation or opt-out)
DROP FUNCTION IF EXISTS public.delete_chat_key_backup(uuid);
CREATE OR REPLACE FUNCTION public.delete_chat_key_backup(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  UPDATE public.user_chat_keys
  SET
    encrypted_private_key_backup = NULL,
    backup_salt = NULL,
    backup_created_at = NULL
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update publish_user_chat_public_key to clear encrypted backup on key rotation
-- (new keypair means old backup is useless)
DROP FUNCTION IF EXISTS public.publish_user_chat_public_key(uuid, text);
CREATE OR REPLACE FUNCTION public.publish_user_chat_public_key(
  p_user_id uuid,
  p_public_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_public_key, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_public_key');
  END IF;

  INSERT INTO public.user_chat_keys (user_id, public_key)
  VALUES (p_user_id, p_public_key)
  ON CONFLICT (user_id) DO UPDATE SET
    public_key = EXCLUDED.public_key,
    updated_at = now(),
    -- Clear encrypted backup when publishing a new public key (key rotation)
    encrypted_private_key_backup = NULL,
    backup_salt = NULL,
    backup_created_at = NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_chat_key_backup(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_key_backup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_chat_key_backup(uuid) TO authenticated;
