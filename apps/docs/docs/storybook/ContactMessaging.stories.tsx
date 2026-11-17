import React from 'react';
import { View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent } from '@storybook/test';
import FloatingMessages from '../../../mobile-app/components/messages/FloatingMessages';
import { uiPalette, uiTokens } from '../../../../packages/ui/src/system/tokens';
const conversations = [
  { id: 'ari', name: 'Ari Chen', role: 'Designer', company: '', handle: 'ari', preview: 'See you at the meeting?', updated_at: null, needs_reply: true },
  { id: 'sam', name: 'Sam Rivera', role: 'Builder', company: '', handle: 'sam', preview: 'Hello!', updated_at: null, needs_reply: true },
  { id: 'min', name: 'Min Park', role: 'Founder', company: '', handle: 'min', preview: 'Thanks for connecting', updated_at: null, needs_reply: true },
  { id: 'jo', name: 'Jo Kim', role: '', company: '', handle: 'jokim', preview: 'Can you share the details?', updated_at: null, needs_reply: true },
];
const meta = {
  title: 'Production/Contact messaging/Floating Messages', parameters: { layout: 'fullscreen' }, component: FloatingMessages,
  args: { mode: 'light', conversations, onPress: fn() },
  decorators: [(Story, { args }) => <View style={{ backgroundColor: uiPalette(args.mode).canvas, padding: uiTokens.space.xl, minHeight: 160, alignItems: 'flex-end' }}><Story /></View>],
} satisfies Meta<typeof FloatingMessages>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PendingReplies: Story = { play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Messages (4)' })); await expect(args.onPress).toHaveBeenCalled();
} };
export const Dark: Story = { args: { mode: 'dark' } };
export const ThreeProfiles: Story = { args: { conversations: conversations.slice(0, 3) } };
export const NoPendingReplies: Story = { args: { conversations: conversations.map(person => ({ ...person, needs_reply: false })) }, play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByRole('button')).toBeNull(); } };
export const MobileLongTranslation: Story = { args: { label: 'Mensajes pendientes', conversations: conversations.slice(0, 1) }, parameters: { viewport: { defaultViewport: 'mobile1' } } };
