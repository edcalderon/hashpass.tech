import { Platform } from 'react-native';

const MAX_BYTES = 16_384;
/** Export only after explicit user action. Temporary native files are removed. */
export async function saveRecoveryFile(contents: string, plaintext = false): Promise<void> {
  const name = plaintext ? 'hashpass-recovery-phrase.txt' : 'hashpass-recovery.json';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([contents], { type: plaintext ? 'text/plain' : 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const fs = require('expo-file-system') as typeof import('expo-file-system');
  const sharing = require('expo-sharing') as typeof import('expo-sharing');
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  if (!fs.cacheDirectory || !await sharing.isAvailableAsync()) throw new Error('export_unavailable');
  const path = `${fs.cacheDirectory}${crypto.randomUUID()}-${name}`;
  try {
    await fs.writeAsStringAsync(path, contents);
    await sharing.shareAsync(path, { mimeType: plaintext ? 'text/plain' : 'application/json', dialogTitle: name });
  } finally { await fs.deleteAsync(path, { idempotent: true }); }
}

export async function pickRecoveryFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
      input.oncancel = () => { input.remove(); resolve(null); };
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          if (file.size > MAX_BYTES) throw new Error('invalid_backup');
          resolve(await file.text());
        } catch { reject(new Error('invalid_backup')); } finally { input.remove(); }
      };
      input.click();
    });
  }
  const picker = require('expo-document-picker') as typeof import('expo-document-picker');
  const fs = require('expo-file-system') as typeof import('expo-file-system');
  const result = await picker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const file = result.assets[0];
  try {
    const info = await fs.getInfoAsync(file.uri);
    if (!info.exists || info.isDirectory || info.size > MAX_BYTES) throw new Error('invalid_backup');
    const contents = await fs.readAsStringAsync(file.uri);
    if (contents.length > MAX_BYTES) throw new Error('invalid_backup');
    return contents;
  } finally {
    // Only delete our cached copy, never the user's original backup.
    if (fs.cacheDirectory && file.uri.startsWith(fs.cacheDirectory)) await fs.deleteAsync(file.uri, { idempotent: true });
  }
}

export async function protectRecoveryScreen(): Promise<() => void> {
  if (Platform.OS === 'web') return () => {};
  const capture = require('expo-screen-capture') as typeof import('expo-screen-capture');
  await capture.preventScreenCaptureAsync('wallet-recovery');
  return () => { void capture.allowScreenCaptureAsync('wallet-recovery').catch(() => {}); };
}
