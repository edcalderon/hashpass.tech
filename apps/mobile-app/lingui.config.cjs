const { formatter } = require("@lingui/format-json");

module.exports = {
  locales: ["en", "es", "ko", "fr", "pt", "de"],
  sourceLocale: "en",
  fallbackLocales: { default: "en" },
  catalogs: [
    {
      // Keep Lingui's flat catalogs separate from the runtime JSON dictionaries
      // consumed by i18n/i18n.ts.
      path: "i18n/catalogs/{locale}",
      include: ["app", "components", "providers", "hooks"],
      // These legacy legal views intentionally share message IDs while using
      // different revision-specific copy. Keep their existing catalog entries
      // but exclude them from extraction until the copy is consolidated.
      exclude: ["app/(shared)/privacy.tsx", "components/PrivacyTermsModal.tsx"],
    },
  ],
  format: formatter({ style: "minimal" })
};
