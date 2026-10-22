import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/api-client';
import type { CampaignCopy, CampaignLocale, MarketingOverview, MarketingOverviewResult } from '../types/marketing';

export function useMarketing(owner: string | null) {
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const currentOwner = useRef(owner);
  if (currentOwner.current !== owner) {
    currentOwner.current = owner; generation.current++; pending.current = false;
    setOverview(null); setError(null); setBusy(false);
  }
  const reload = useCallback(async () => {
    if (!owner || pending.current) return;
    const run = ++generation.current;
    setLoading(true); setError(null);
    try {
      const result = await apiClient.get('admin/marketing', { skipEventSegment: true, retries: 0 }) as MarketingOverviewResult;
      if (run !== generation.current) return;
      if (result.success) setOverview(result.data.data); else setError(result.error);
    } catch { if (run === generation.current) setError('Campaign service unavailable'); }
    finally { if (run === generation.current) setLoading(false); }
  }, [owner]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);

  const request = useCallback(async (body: Record<string, unknown>) => {
    if (!owner || pending.current) return null;
    const run = ++generation.current;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await apiClient.post('admin/marketing', body, { skipEventSegment: true, retries: 0 });
      if (run !== generation.current) return null;
      if (!result.success) { setError(result.error); return null; }
      return result;
    } catch { if (run === generation.current) setError('Campaign service unavailable'); return null; }
    finally { if (run === generation.current) { pending.current = false; setBusy(false); setLoading(false); } }
  }, [owner]);
  const act = useCallback(async (body: Record<string, unknown>) => {
    const result = await request(body);
    if (!result) return false;
    await reload(); return true;
  }, [request, reload]);
  const preview = useCallback(async (copy: CampaignCopy, locale: CampaignLocale, eventId: string) => {
    const result = await request({ action: 'preview', copy, locale, eventId });
    return result?.data?.data?.html || null;
  }, [request]);
  return { overview, loading, busy, error, reload, act, preview };
}
