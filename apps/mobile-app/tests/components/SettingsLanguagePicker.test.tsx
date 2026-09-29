/// <reference types="jest" />

import { settingsLanguageOptionsTestId } from "../../components/SettingsLanguagePicker";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "Light",
  },
  impactAsync: jest.fn(),
}));

// settingsLanguageOptionsTestId is a plain function with no dependency on
// i18n or locale storage, but importing the module still evaluates its
// other imports (LanguageProvider -> useLanguageStore -> AsyncStorage,
// i18n/i18n -> expo-localization), which throw under Jest without native
// modules. Stub them out so the module can load.
jest.mock("../../providers/LanguageProvider", () => ({
  useLanguage: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("../../i18n/i18n", () => ({
  getAvailableLocales: () => [{ code: "en", name: "english" }],
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

jest.mock("../../components/icons/SettingsIcons", () => ({
  CheckIcon: "CheckIcon",
  ChevronDownIcon: "ChevronDownIcon",
  getFlagEmoji: () => "🇺🇸",
}));

// process.env.NODE_ENV is typed read-only in this repo's TS config, even
// though Jest's Node runtime allows the mutation fine. Object.defineProperty
// sidesteps the type error without an `as any` cast at every call site.
function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

describe("settingsLanguageOptionsTestId", () => {
  it("hides the options-panel testID on production web builds but keeps it under test and on native", () => {
    const rn = require("react-native");
    const originalPlatformOs = rn.Platform.OS;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      rn.Platform.OS = "web";

      setNodeEnv("test");
      expect(settingsLanguageOptionsTestId()).toEqual({
        testID: "settings-language-options",
      });

      setNodeEnv("production");
      expect(settingsLanguageOptionsTestId()).toEqual({});

      rn.Platform.OS = "ios";
      expect(settingsLanguageOptionsTestId()).toEqual({
        testID: "settings-language-options",
      });
    } finally {
      rn.Platform.OS = originalPlatformOs;
      setNodeEnv(originalNodeEnv);
    }
  });
});
