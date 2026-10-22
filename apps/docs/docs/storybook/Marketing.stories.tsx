import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import MarketingPanel from '../../../mobile-app/components/admin/MarketingPanel';
import type { MarketingOverview } from '../../../mobile-app/types/marketing';
import pack from '../../../mobile-app/config/marketing/bsl2026.json';

// Fictional operation IDs and zero delivery counts are catalog fixtures only.
const overview: MarketingOverview = {
  campaigns: pack.messages.map((m, i) => ({ id: `fixture-${i}`, key: m.key, name: m.name, event_id: m.eventId, status: 'draft', scheduled_at: m.scheduledAt, time_zone: m.timeZone, content: m.content, requirements: m.requirements, readiness: {}, counts: {} })),
  deliveries: [], audit: [], snapshots: [], activity: { verified: 0, observed: 0, points: 0 },
};
const meta = {
  title: 'Product/Marketing', component: MarketingPanel, parameters: { layout: 'padded' },
  args: { overview, mode: 'dark', onRefresh: () => {}, onAction: async () => true, onPreview: async () => '<p>Email preview</p>' },
} satisfies Meta<typeof MarketingPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { args: { mode: 'light' } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
export const Empty: Story = { args: { overview: { ...overview, campaigns: [] } } };
export const Unavailable: Story = { args: { overview: null, error: 'unavailable' } };
export const Loading: Story = { args: { overview: null, loading: true } };
export const Busy: Story = { args: { busy: true } };
export const LongCopy: Story = { args: { overview: { ...overview, campaigns: overview.campaigns.map(c => ({ ...c, name: 'Prepara conversaciones significativas y construye una red de contactos para BSL Colombia 2026' })) } } };
