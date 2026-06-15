import React from 'react';
import {
  CameraView,
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
  type BarcodeScanningResult,
  type BarcodeType,
  type CameraType,
  type CameraViewProps,
} from 'expo-camera';

export type BarCodeScannerResult = BarcodeScanningResult;

export type BarCodeScannerProps = Omit<
  CameraViewProps,
  'facing' | 'barcodeScannerSettings' | 'onBarcodeScanned'
> & {
  type?: CameraType;
  barCodeTypes?: BarcodeType[];
  onBarCodeScanned?: (result: BarcodeScanningResult) => void;
};

function BarCodeScannerComponent({
  type,
  barCodeTypes,
  onBarCodeScanned,
  ...props
}: BarCodeScannerProps) {
  return (
    <CameraView
      {...props}
      facing={type}
      barcodeScannerSettings={barCodeTypes ? { barcodeTypes: barCodeTypes } : undefined}
      onBarcodeScanned={onBarCodeScanned}
    />
  );
}

export const BarCodeScanner = Object.assign(BarCodeScannerComponent, {
  Constants: {
    BarCodeType: {
      qr: 'qr' as BarcodeType,
    },
  },
  requestPermissionsAsync: requestCameraPermissionsAsync,
  getPermissionsAsync: getCameraPermissionsAsync,
});

export type { BarcodeType };
