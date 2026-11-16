export type PassEventRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string | null;
  venue_name?: string | null;
  city?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown> | null;
};
