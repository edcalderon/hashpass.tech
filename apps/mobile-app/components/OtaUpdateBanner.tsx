import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';

export default function OtaUpdateBanner({ onApply }: { onApply: () => Promise<void> }) {
  const { colors } = useTheme();
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    setApplying(true);
    try { await onApply(); } finally { setApplying(false); }
  };
  return (
    <View style={[styles.banner, { borderColor: colors.primary, backgroundColor: colors.background.paper }]}>
      <MaterialIcons name="system-update" size={20} color={colors.primary} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Update ready</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>Restart to use the latest improvements.</Text>
      </View>
      <TouchableOpacity accessibilityLabel="Restart to apply update" onPress={apply} disabled={applying} style={[styles.button, { backgroundColor: colors.primary }]}>
        {applying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>Restart</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 16, right: 16, bottom: 20, zIndex: 1000, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderRadius: 14, elevation: 8 },
  copy: { flex: 1 }, title: { fontWeight: '700', fontSize: 14 }, subtitle: { fontSize: 12, marginTop: 2 },
  button: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9 }, buttonText: { color: '#fff', fontWeight: '700' },
});
