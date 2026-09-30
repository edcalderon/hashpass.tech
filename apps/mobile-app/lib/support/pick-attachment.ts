/**
 * Native (iOS/Android) file picking for a support-ticket attachment.
 * Mirrors components/CloudinaryImageUpload.tsx's mobile-upload pattern
 * (pick a native asset, fetch its uri into a blob, wrap as a real `File`)
 * so the rest of the app has exactly one working way to turn a
 * platform-native picker result into something `sendSupportAttachment`
 * (a plain multipart `File` field) can send. Web doesn't need this module
 * at all -- support.tsx uses a plain hidden `<input type="file">` there,
 * same as CloudinaryImageUpload does.
 */
import * as DocumentPicker from 'expo-document-picker';
import { SUPPORT_ATTACHMENT_ALLOWED_TYPES, SUPPORT_ATTACHMENT_MAX_BYTES } from './frappe-support-client';

export interface PickedAttachmentError {
  message: string;
}

export async function pickAttachmentNative(): Promise<File | PickedAttachmentError | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORT_ATTACHMENT_ALLOWED_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType || '';
  if (!SUPPORT_ATTACHMENT_ALLOWED_TYPES.includes(mimeType)) {
    return { message: 'Only images and PDF files can be attached.' };
  }
  if (typeof asset.size === 'number' && asset.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return { message: 'File is too large (10MB max).' };
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  if (blob.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return { message: 'File is too large (10MB max).' };
  }
  return new File([blob], asset.name || 'attachment', { type: mimeType || blob.type || 'application/octet-stream' });
}

export function isPickedAttachmentError(value: unknown): value is PickedAttachmentError {
  return !!value && typeof value === 'object' && 'message' in (value as Record<string, unknown>);
}
