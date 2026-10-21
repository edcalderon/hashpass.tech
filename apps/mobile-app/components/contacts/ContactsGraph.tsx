import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { contactInitials } from '../../lib/contacts';
import type { ContactsGraphProps } from '../../types/contacts';

const colors = [uiTokens.feature.cyan, uiTokens.feature.violet, uiTokens.feature.green, uiTokens.feature.amber, uiTokens.feature.red];

/** Static, deterministic layout: no perpetual animation or motion-sensitive controls. */
export default function ContactsGraph({ contacts, topics, grouping, selected, mode, onSelect, youLabel, topicLabel }: ContactsGraphProps) {
  const palette = uiPalette(mode);
  const [width, setWidth] = useState(640);
  const height = width < 440 ? 360 : 440;
  const cx = width / 2;
  const cy = height / 2;
  const visibleContacts = contacts.slice(0, 80);
  const groups = [...new Set(visibleContacts.length ? visibleContacts.map(contact => grouping === 'topic' ? contact.topics[0] || 'Community' : contact.company || 'Community') : topics)];
  const orbit = Math.min(width * 0.29, height * 0.32);
  const hubs = groups.map((label, index) => {
    const angle = index / Math.max(groups.length, 1) * Math.PI * 2 - Math.PI / 2;
    return { label, x: cx + Math.cos(angle) * orbit, y: cy + Math.sin(angle) * orbit, color: colors[index % colors.length] };
  });
  const nodes = visibleContacts.map(contact => {
    const key = grouping === 'topic' ? contact.topics[0] || 'Community' : contact.company || 'Community';
    const hubIndex = groups.indexOf(key);
    const hub = hubs[Math.max(0, hubIndex)];
    const siblings = contacts.filter(item => (grouping === 'topic' ? item.topics[0] || 'Community' : item.company || 'Community') === key);
    const index = siblings.findIndex(item => item.id === contact.id);
    const angle = index * 2.39996;
    const radius = siblings.length === 1 ? 0 : Math.min(64, 32 * Math.sqrt(index + 1));
    let x = (hub?.x ?? cx) + Math.cos(angle) * radius;
    let y = (hub?.y ?? cy) + Math.sin(angle) * radius;
    // Keep contact targets outside the central identity ring on small screens.
    const distance = Math.hypot(x - cx, y - cy);
    const minimum = 74;
    if (distance < minimum) {
      const direction = distance ? Math.atan2(y - cy, x - cx) : 0;
      x = cx + Math.cos(direction) * minimum;
      y = cy + Math.sin(direction) * minimum;
    }
    return { contact, x: Math.max(26, Math.min(width - 26, x)), y: Math.max(40, Math.min(height - 26, y)), color: hub?.color ?? palette.accent };
  });

  return <View testID="contacts-graph" onLayout={event => setWidth(Math.max(240, event.nativeEvent.layout.width))} style={[styles.graph, { height }]}>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessible={false}>
      {[0.6, 1, 1.45].map(size => <Circle key={size} cx={cx} cy={cy} r={orbit * size} stroke={palette.border} strokeWidth={1} strokeDasharray={size === 1 ? undefined : '3 8'} fill="none" />)}
      {hubs.map(hub => <Line key={hub.label} x1={cx} y1={cy} x2={hub.x} y2={hub.y} stroke={hub.color} strokeOpacity={0.45} strokeDasharray="3 6" />)}
      {nodes.map(node => <Line key={node.contact.id} x1={cx} y1={cy} x2={node.x} y2={node.y} stroke={node.color} strokeOpacity={selected === node.contact.id ? 0.9 : 0.2} />)}
      <Circle cx={cx} cy={cy} r={44} fill={palette.accentSoft} stroke={palette.accent} strokeOpacity={0.2} />
      <Circle cx={cx} cy={cy} r={30} fill={palette.accentSoft} stroke={palette.accent} strokeWidth={2} />
    </Svg>
    <View pointerEvents="none" style={[styles.center, { left: cx - 30, top: cy - 30 }]}><Text style={[styles.you, { color: palette.accent }]}>{youLabel}</Text></View>
    {hubs.map(hub => <View key={hub.label} pointerEvents="none" style={[styles.hubLabel, { left: Math.max(0, Math.min(width - 104, hub.x - 52)), top: hub.y + (contacts.length ? hub.y >= cy ? 28 : -56 : -12) }]}>
      <Text numberOfLines={2} style={[styles.label, { color: palette.text }]}>{grouping === 'topic' || !contacts.length ? topicLabel(hub.label) : hub.label}</Text>
      {!contacts.length && <View style={[styles.dot, { backgroundColor: hub.color }]} />}
    </View>)}
    {nodes.map(node => <Pressable key={node.contact.id} accessibilityRole="button" accessibilityLabel={node.contact.name} accessibilityState={{ selected: selected === node.contact.id }} onPress={() => onSelect(node.contact.id)} style={[styles.node, { left: node.x - 22, top: node.y - 22, backgroundColor: selected === node.contact.id ? palette.accentSoft : palette.raised, borderColor: node.color, borderWidth: selected === node.contact.id ? 3 : 1 }]}>
      <Text style={[styles.initials, { color: palette.text }]}>{contactInitials(node.contact.name)}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  graph: { width: '100%', overflow: 'hidden' },
  center: { position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  you: { fontSize: uiTokens.type.caption, fontWeight: '700', textAlign: 'center' },
  hubLabel: { position: 'absolute', width: 104, alignItems: 'center', gap: uiTokens.space.sm },
  label: { fontSize: uiTokens.type.caption, fontWeight: '600', textAlign: 'center' },
  dot: { width: 10, height: 10, borderRadius: uiTokens.radius.circle },
  node: { position: 'absolute', width: 44, height: 44, borderRadius: uiTokens.radius.circle, justifyContent: 'center', alignItems: 'center' },
  initials: { fontSize: uiTokens.type.caption, fontWeight: '700' },
});
