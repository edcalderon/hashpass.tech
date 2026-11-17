import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import PinPad from '../../../mobile-app/components/security/PinPad';
import { uiPalette, uiTokens } from '../../../../packages/ui/src/system/tokens';

const meta = {
  title: 'Product/Security/PIN Pad',
  component: PinPad,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => {
      const palette = uiPalette(context.args.mode ?? 'dark');
      return (
        <View style={{ width: '100%', alignItems: 'center', backgroundColor: palette.canvas, padding: uiTokens.space.xl }}>
          <View style={{ width: '100%', maxWidth: 520, padding: uiTokens.space.xl, borderRadius: uiTokens.radius.card, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
            <Story />
          </View>
        </View>
      );
    },
  ],
  args: {
    mode: 'dark',
    title: 'Enter your PIN',
    hint: undefined,
    error: null,
    busy: false,
    disabled: false,
    onComplete: () => undefined,
  },
} satisfies Meta<typeof PinPad>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};
export const Light: Story = { args: { mode: 'light' } };
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
export const Error: Story = { args: { error: 'That PIN is not right. 2 tries left.' } };
export const Busy: Story = { args: { busy: true } };
export const Disabled: Story = { args: { disabled: true } };
export const LongCopy: Story = {
  args: {
    title: 'Ingresa tu PIN de cuatro dígitos para abrir tu billetera',
    hint: 'Este PIN protege tu billetera en este dispositivo. Puedes cambiarlo después desde la configuración de seguridad.',
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
