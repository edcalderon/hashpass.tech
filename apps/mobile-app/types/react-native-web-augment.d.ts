import 'react-native';

declare module 'react-native' {
  // Web-only auth screens rely on `dataSet` hooks for enter-key handling.
  interface ViewProps {
    className?: string;
    dataSet?: Record<string, string>;
  }

  interface TextProps {
    className?: string;
  }

  interface ImageProps {
    className?: string;
  }

  interface PressableProps {
    className?: string;
    dataSet?: Record<string, string>;
  }

  interface TouchableOpacityProps {
    className?: string;
    dataSet?: Record<string, string>;
  }

  interface ScrollViewProps {
    className?: string;
    dataSet?: Record<string, string>;
  }

  interface ImageBackgroundProps {
    className?: string;
  }
}

export {};
