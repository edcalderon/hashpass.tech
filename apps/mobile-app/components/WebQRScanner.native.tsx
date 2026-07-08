interface WebQRScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (text: string) => void;
  onError?: (error: Error) => void;
  title?: string;
}

export default function WebQRScanner(_props: WebQRScannerProps) {
  return null;
}
