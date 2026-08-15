-- Existing opaque slugs remain valid; custom slugs are constrained more tightly by the API.
ALTER TABLE qr_links DROP CONSTRAINT IF EXISTS qr_links_public_slug_check;
ALTER TABLE qr_links
  ADD CONSTRAINT qr_links_public_slug_check
  CHECK (public_slug ~ '^[A-Za-z0-9_-]{3,48}$');
