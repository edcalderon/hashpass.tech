# @hashpass/support-react-native

Expo-compatible native adapter foundation for HashPass Support. The MVP exports a controller that uses `@hashpass-tech/sdk` directly and requires a caller-provided Keychain/Keystore-backed storage adapter, such as Expo SecureStore, for durable native ticket/session references. The primary UI component will be added after backend support persistence lands; no WebView is used.
