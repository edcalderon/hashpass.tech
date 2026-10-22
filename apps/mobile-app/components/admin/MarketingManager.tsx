import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useMarketing } from '../../hooks/useMarketing';
import MarketingPanel from './MarketingPanel';

export default function MarketingManager({ mode }: { mode: 'light' | 'dark' }) {
  const { user } = useAuth();
  const state = useMarketing(user?.id || null);
  return <MarketingPanel mode={mode} {...state} onRefresh={state.reload} onAction={state.act} onPreview={state.preview} />;
}
