import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';
import { ActionButton, Surface } from '../../../../packages/ui/src/system/primitives';
import { uiPalette, uiTokens } from '../../../../packages/ui/src/system/tokens';
import FeatureIcon from '../../../mobile-app/components/FeatureIcon';

const features = [
  { name: 'shield-checkmark', title: 'Secure by design', color: uiTokens.feature.cyan },
  { name: 'key', title: 'Your keys, your control', color: uiTokens.feature.red },
  { name: 'sync', title: 'Cross-platform sync', color: uiTokens.feature.green },
  { name: 'qr-code-outline', title: 'Fast entry', color: uiTokens.feature.violet },
  { name: 'people-outline', title: 'Private networking', color: uiTokens.feature.amber },
];

function Gallery({ dark = false, reduceMotion = false, compact = false, translated = false }) {
  const [revision, setRevision] = useState(0);
  const palette = uiPalette(dark);
  return <View style={{ backgroundColor: palette.canvas, padding: uiTokens.space.xl, gap: uiTokens.space.xl }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: uiTokens.space.lg }}>
      {features.map(feature => <Surface key={feature.name} mode={dark ? 'dark' : 'light'} style={{ width: 240, alignItems: 'center', gap: uiTokens.space.lg }}>
        <FeatureIcon key={revision} name={feature.name} color={feature.color} compact={compact} reduceMotion={reduceMotion} active />
        <Text style={{ color: palette.text, fontSize: uiTokens.type.body, fontWeight: '700', textAlign: 'center' }}>
          {translated ? `Conexiones privadas entre asistentes · 기기 간 안전한 동기화 · ${feature.title}` : feature.title}
        </Text>
      </Surface>)}
    </View>
    <ActionButton mode={dark ? 'dark' : 'light'} label="Replay icon motion" onPress={() => setRevision(value => value + 1)} />
  </View>;
}

const meta = { title: 'Landing/Feature icons', component: Gallery, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Gallery>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { args: { dark: true } };
export const ReducedMotion: Story = { args: { reduceMotion: true } };
export const Compact: Story = { args: { compact: true } };
export const MobileTranslations: Story = { args: { translated: true }, parameters: { viewport: { defaultViewport: 'mobile1' } } };
