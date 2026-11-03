export type NotificationDateTimeFieldProps = {
  mode: 'light' | 'dark';
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  accessibilityHint: string;
};
