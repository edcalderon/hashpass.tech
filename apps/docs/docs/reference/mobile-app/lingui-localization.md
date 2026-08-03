# Mobile localization with Lingui

The mobile app uses Lingui for component-level translations and keeps the
existing runtime locale dictionaries as the source for product copy. This
allows screens to use a consistent `t(id, fallback)` API while preserving the
locale files used by the language picker and older flows.

## Catalogs and locales

Supported locales are configured in `apps/mobile-app/lingui.config.cjs`:

`en`, `es`, `ko`, `fr`, `pt`, and `de`.

Lingui catalogs are flat JSON files under
`apps/mobile-app/i18n/catalogs/{locale}.json`. The runtime dictionaries live
under `apps/mobile-app/i18n/locales/{locale}.json`. Do not edit generated
catalog entries just to make a check pass; add or update the copy in the
runtime locale dictionary first.

## Development workflow

From the repository root:

```bash
pnpm run i18n:extract
pnpm run i18n:compile
pnpm run i18n:check
```

`i18n:extract` runs Lingui extraction and then
`packages/tools/scripts/sync-lingui-catalogs.mjs`. The sync step fills catalog
messages from the runtime dictionaries and falls back to English when a
translation is not available yet. `i18n:check` is CI-safe: it exits non-zero
when catalogs are out of sync, without rewriting files.

When adding a translatable string, give it a stable ID and an English
fallback:

```tsx
const { t } = useTranslation('version');
return <Text>{t('otaCheck', 'Check for OTA updates')}</Text>;
```

Keep IDs stable after release. Renaming an ID creates a new message and can
leave an old translation orphaned in another locale.

## Adding a locale

1. Add the locale to `locales` in `lingui.config.cjs`.
2. Add `apps/mobile-app/i18n/locales/<locale>.json` with the runtime message
   structure.
3. Run `pnpm run i18n:extract` and review the generated catalog.
4. Run `pnpm run i18n:compile` and `pnpm run i18n:check`.
5. Verify the language picker and the affected screen on mobile and web.

Missing translations intentionally fall back to English; a missing key must
not prevent the app from rendering.

## Troubleshooting

- **`i18n:check` reports stale catalogs:** run `pnpm run i18n:extract`, inspect
  the diff, and commit the synchronized catalog files.
- **Extraction reports duplicate IDs:** use one canonical message ID and
  remove or exclude legacy copies rather than adding a second translation.
- **The UI still shows old copy:** restart Metro after compiling catalogs and
  clear its cache only if the generated artifact is stale.
