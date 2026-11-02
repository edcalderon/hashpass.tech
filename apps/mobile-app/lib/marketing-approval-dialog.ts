import { Alert } from 'react-native';

export function confirmMarketingCampaignAction(
  platform: string,
  title: string,
  message: string,
  actionLabel: string,
  cancelLabel: string,
  isDestructive: boolean,
  onConfirm: () => void,
): void {
  if (platform === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: actionLabel, style: isDestructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function showMarketingCampaignResult(
  platform: string,
  title: string,
  message: string,
): void {
  if (platform === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
