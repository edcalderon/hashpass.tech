import { Platform } from 'react-native';
const mockSave = jest.fn(); const mockDelete = jest.fn(); const mockShare = jest.fn();
const mockPick = jest.fn(); const mockRead = jest.fn(); const mockInfo = jest.fn();
const mockPrevent = jest.fn(); const mockAllow = jest.fn();
jest.mock('expo-file-system', () => ({ cacheDirectory: 'file:///cache/', writeAsStringAsync: (...args: any[]) => mockSave(...args), deleteAsync: (...args: any[]) => mockDelete(...args), readAsStringAsync: (...args: any[]) => mockRead(...args), getInfoAsync: (...args: any[]) => mockInfo(...args) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...args: any[]) => mockShare(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'unique' }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: () => mockPick() }));
jest.mock('expo-screen-capture', () => ({ preventScreenCaptureAsync: () => mockPrevent(), allowScreenCaptureAsync: () => mockAllow() }));
import { pickRecoveryFile, protectRecoveryScreen, saveRecoveryFile } from '../../lib/wallet/recovery-files';
beforeEach(() => { Platform.OS = 'ios'; jest.clearAllMocks(); mockDelete.mockResolvedValue(undefined); mockAllow.mockResolvedValue(undefined); });
it('removes exported temporary files even when sharing fails', async () => {
  mockShare.mockRejectedValue(new Error('cancelled'));
  await expect(saveRecoveryFile('encrypted-fixture')).rejects.toThrow('cancelled');
  expect(mockSave).toHaveBeenCalledWith('file:///cache/unique-hashpass-recovery.json', 'encrypted-fixture');
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/unique-hashpass-recovery.json', { idempotent: true });
});
it('rejects oversized backup files before reading and cleans its cached copy', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/picked' }] });
  mockInfo.mockResolvedValue({ exists: true, isDirectory: false, size: 16385 });
  await expect(pickRecoveryFile()).rejects.toThrow('invalid_backup');
  expect(mockRead).not.toHaveBeenCalled(); expect(mockDelete).toHaveBeenCalled();
});
it('handles cancellation and never deletes the original external file', async () => {
  mockPick.mockResolvedValueOnce({ canceled: true }); expect(await pickRecoveryFile()).toBeNull();
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///documents/original' }] });
  mockInfo.mockResolvedValue({ exists: true, isDirectory: false, size: 20 }); mockRead.mockResolvedValue('encrypted-fixture');
  expect(await pickRecoveryFile()).toBe('encrypted-fixture'); expect(mockDelete).not.toHaveBeenCalled();
});
it('does not permit secret display when screen protection fails', async () => {
  mockPrevent.mockRejectedValueOnce(new Error('unsupported'));
  await expect(protectRecoveryScreen()).rejects.toThrow('unsupported');
  mockPrevent.mockResolvedValue(undefined); const cleanup = await protectRecoveryScreen(); cleanup();
  expect(mockAllow).toHaveBeenCalledTimes(1);
});
