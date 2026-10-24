import { Linking, Share } from 'react-native';
import type { PublicSharePayload } from './share.types';

/** Open the platform share sheet without exposing anything beyond a public receive address. */
export async function sharePublicReceiveDetails(payload: PublicSharePayload): Promise<boolean> {
  try {
    const result = await Share.share(payload);
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}

/** Open a social share target; callers can show their own success state. */
export async function openReceiveSocial(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
