import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '../../lib/vector-icons';
import { ActionButton } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { contactInitials } from '../../lib/contacts';
import { pendingConversations } from '../../lib/contact-messaging';
import type { FloatingMessagesProps, MessageAvatarProps } from '../../types/contact-messaging';
export function MessageAvatar({ name, avatar_url, mode }: MessageAvatarProps) {
  const palette = uiPalette(mode);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [avatar_url]);
  return avatar_url && !failed ? <Image source={{ uri: avatar_url }} onError={() => setFailed(true)} accessibilityLabel={name} style={styles.avatar} /> :
    <View accessibilityLabel={name} style={[styles.avatar, { backgroundColor: palette.raised }]}><Text style={{ color: palette.text, fontWeight: '600' }}>{contactInitials(name)}</Text></View>;
}
export default function FloatingMessages({ conversations, mode, onPress, label = 'Messages' }: FloatingMessagesProps) {
  const pending = pendingConversations(conversations);
  if (!pending.length) return null;
  const palette = uiPalette(mode);
  return <ActionButton mode={mode} variant="ghost" label={label} labelNumberOfLines={1} skin={{ accent: palette.text, fill: palette.accentFill, onFill: palette.onAccent, soft: palette.accentSoft, border: palette.border }} onPress={onPress}
    accessibilityLabel={`${label} (${pending.length})`}
    style={[styles.pill, { backgroundColor: palette.raised, borderColor: palette.border }]}
    leadingIcon={<Ionicons name="send" size={uiTokens.type.title} color={palette.text} />}
    trailingIcon={<View style={styles.profiles}>{pending.slice(0, 3).map(person => <MessageAvatar key={person.id} {...person} mode={mode} />)}{pending.length > 3 && <Text style={{ color: palette.text }}>+{pending.length - 3}</Text>}</View>} />;
}
const styles = StyleSheet.create({
  pill: { maxWidth: '100%', borderWidth: uiTokens.control.borderWidth, padding: uiTokens.space.lg, gap: uiTokens.space.md, boxShadow: uiTokens.effects.cardShadow },
  profiles: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.xs },
  avatar: { width: uiTokens.space.xxl, height: uiTokens.space.xxl, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
});
