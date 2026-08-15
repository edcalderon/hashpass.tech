-- QR links can be perpetual or available only within a validated time window.
ALTER TABLE qr_links
  ADD COLUMN starts_at timestamptz,
  ADD CONSTRAINT qr_links_availability_window_chk
    CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at);

CREATE INDEX qr_links_expiry_sweep_idx
  ON qr_links(expires_at)
  WHERE status = 'active' AND deleted_at IS NULL AND expires_at IS NOT NULL;
