import * as SecureStore from "expo-secure-store";
import { NativeSupportController } from "@hashpass/support-react-native";

export const support = new NativeSupportController({
  appId: "PUBLIC_APP_ID",
  secureStore: {
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    deleteItem: SecureStore.deleteItemAsync,
  },
});
