/** Keeps operational sync metadata out of attendee-facing agenda copy. */
export const getDisplayAgendaDescription = (
  description: string | null | undefined,
): string | null => {
  const value = description?.trim();
  if (!value) return null;

  // Older Colombia syncs stored reconciliation metadata in the legacy
  // description column. Keep operational JSON out of search and the UI while
  // still allowing genuine organizer-written descriptions to render.
  if (value.startsWith('{') && value.endsWith('}')) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if ('source_fingerprint' in parsed || ('source' in parsed && 'ends_at' in parsed)) {
        return null;
      }
    } catch {
      // A human-authored description can legitimately contain braces.
    }
  }

  return value;
};
