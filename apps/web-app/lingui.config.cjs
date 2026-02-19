const { formatter } = require("@lingui/format-json");

module.exports = {
  locales: ["en", "es", "ko", "fr", "pt", "de"],
  catalogs: [
    {
      path: "i18n/locales/{locale}.json",
      include: ["app", "components", "providers", "hooks"],
    },
  ],
  format: formatter({ style: "minimal" })
};
