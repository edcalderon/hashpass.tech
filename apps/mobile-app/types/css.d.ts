import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    backdropFilter?: string;
    WebkitBackdropFilter?: string;
  }
}
