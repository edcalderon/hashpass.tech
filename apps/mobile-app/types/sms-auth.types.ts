export type SmsDeliveryResult =
  | { success: true }
  | { success: false; status: number; code: string; message: string };
