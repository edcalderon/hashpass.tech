## [1.8.71](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.70...v1.8.71) (2026-06-22)


### Bug Fixes

* **dashboard:** use RNAnimated.View to fix crash after Google auth on native ([b0d3468](https://github.com/hashpass-tech/hashpass.tech/commit/b0d34680439d56a1be97138ec7713f7aeab501b9))





## [1.8.70](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.69...v1.8.70) (2026-06-22)


### Bug Fixes

* **auth:** avoid logging complex objects in native OAuth callback ([d7c8c71](https://github.com/hashpass-tech/hashpass.tech/commit/d7c8c715707b62c818138217c0b21983befa9773))





## [1.8.69](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.68...v1.8.69) (2026-06-22)


### Bug Fixes

* **notifications:** guard Notification API access on native ([d865259](https://github.com/hashpass-tech/hashpass.tech/commit/d865259aa83e85232c9a32087144e42037e458c2))





## [1.8.68](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.67...v1.8.68) (2026-06-22)


### Bug Fixes

* **auth:** guard window.location in handleOAuthCallback for native ([9a01750](https://github.com/hashpass-tech/hashpass.tech/commit/9a01750c20e4ff3474dfeb3135315900916d315a))





## [1.8.67](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.66...v1.8.67) (2026-06-21)


### Bug Fixes

* **auth:** use HTTPS web relay for native OAuth callback instead of hashpass:// 302 ([401225c](https://github.com/hashpass-tech/hashpass.tech/commit/401225c55504bee907ef55428b4743fe35d56dd6))





## [1.8.66](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.65...v1.8.66) (2026-06-21)


### Bug Fixes

* **auth:** encode native_callback in OAuth state param and harden magic link URL ([91205d2](https://github.com/hashpass-tech/hashpass.tech/commit/91205d22397448ecc21d0948213a9a0bd200c74d))





## [1.8.65](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.64...v1.8.65) (2026-06-21)


### Bug Fixes

* **auth:** use API base URL for native OAuth and fix magic link localhost fallback ([4e34de5](https://github.com/hashpass-tech/hashpass.tech/commit/4e34de5dad6d24fdda8279fe20b6bd73020be55d))





## [1.8.64](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.63...v1.8.64) (2026-06-21)


### Bug Fixes

* **auth:** route native Google OAuth through web relay to avoid Directus config error ([eed321e](https://github.com/hashpass-tech/hashpass.tech/commit/eed321e28a6f3ab9a7e9b6a6d94775b51adf6a7b))





## [1.8.63](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.62...v1.8.63) (2026-06-21)


### Bug Fixes

* **android:** derive versionCode from semver in app.json ([50f0816](https://github.com/hashpass-tech/hashpass.tech/commit/50f0816bc79f007ab657b37120ae862dfe6f5b14))





## [1.8.62](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.61...v1.8.62) (2026-06-21)


### Bug Fixes

* **ci:** increase EC2 runner startup wait from 30s to 75s ([797b019](https://github.com/hashpass-tech/hashpass.tech/commit/797b01951dcc97d9390284f713a5a069c4a44870))





## [1.8.61](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.60...v1.8.61) (2026-06-21)


### Bug Fixes

* **ci:** export PATH immediately after ccache binary download ([4142382](https://github.com/hashpass-tech/hashpass.tech/commit/4142382db3896392a622b5aa119d6bab8d7d2b23))





## [1.8.60](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.59...v1.8.60) (2026-06-21)


### Performance Improvements

* **ci:** preserve android/ across runs for incremental Gradle builds ([a73588e](https://github.com/hashpass-tech/hashpass.tech/commit/a73588eae88db8f44d75d6be4d8cec43d0f0f1e8))





## [1.8.59](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.58...v1.8.59) (2026-06-21)


### Bug Fixes

* **ci:** gracefully skip sudo when no-new-privileges flag is set on EC2 runner ([7a7b37d](https://github.com/hashpass-tech/hashpass.tech/commit/7a7b37d2ac30817d16eb4c3c89d7da72c5996fc1))





## [1.8.58](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.57...v1.8.58) (2026-06-21)


### Bug Fixes

* **ci:** correct heredoc indentation and use env-var for ccache init script ([aa1e0c0](https://github.com/hashpass-tech/hashpass.tech/commit/aa1e0c08cdd4a361c7272f4791344d20c4a41d49))





## [1.8.57](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.56...v1.8.57) (2026-06-21)


### Performance Improvements

* **ci:** add ccache for CMake and fix Gradle property duplication ([745fab3](https://github.com/hashpass-tech/hashpass.tech/commit/745fab39c5a89a9454e0bdae566228a2705824ad))





## [1.8.56](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.55...v1.8.56) (2026-06-21)


### Bug Fixes

* **auth:** read EXPO_PUBLIC_AUTH_PROVIDER so native bundle picks up directus provider ([d990788](https://github.com/hashpass-tech/hashpass.tech/commit/d990788aadf5de55f9e86b1baee3a57cdfef9a24))





## [1.8.55](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.54...v1.8.55) (2026-06-20)


### Bug Fixes

* **ci:** replace runner online poll with 30s sleep ([42d89b8](https://github.com/hashpass-tech/hashpass.tech/commit/42d89b8fa6f9019d1a86c152e19fa81fb1d46f6c))





## [1.8.54](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.53...v1.8.54) (2026-06-20)


### Bug Fixes

* **ci:** add actions:read permission to start-runner job ([fd31155](https://github.com/hashpass-tech/hashpass.tech/commit/fd31155096ce160e13dc2842ebda26f890378bbc))





## [1.8.53](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.52...v1.8.53) (2026-06-20)


### Bug Fixes

* **ci:** set AUTH_PROVIDER=directus for native builds; use EXPO_PUBLIC_SITE_URL for Directus OAuth relay ([7a8d39f](https://github.com/hashpass-tech/hashpass.tech/commit/7a8d39fb74cee751b562931551b60bd5331ee3dd))





## [1.8.52](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.51...v1.8.52) (2026-06-20)


### Bug Fixes

* **native:** use Directus OAuth flow on native and fix toast overflow ([160dd26](https://github.com/hashpass-tech/hashpass.tech/commit/160dd26bd9d3dcc81312c7aec44b04b3a1100910))
* **typecheck:** stub value imports as declare class so they work as types too ([f18c339](https://github.com/hashpass-tech/hashpass.tech/commit/f18c339d3147ded27cf95d6744c3995a09bc2c90))
* **typecheck:** use const:any for value stubs, declare class only for new-called imports ([d413599](https://github.com/hashpass-tech/hashpass.tech/commit/d4135999e55b46d0ced2c6ff0ef611f30d4825df))
* **typecheck:** use declare function for function stubs, declare class only for new-called imports ([a27f456](https://github.com/hashpass-tech/hashpass.tech/commit/a27f456c2ca1bf20d76f78fc13acb042f535bbf0))
* **typecheck:** use import type for type-only imports, skip web-app from mobile typecheck ([25b39f8](https://github.com/hashpass-tech/hashpass.tech/commit/25b39f8fbfb454997b49575e142da6302e436bd0))





## [1.8.51](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.50...v1.8.51) (2026-06-20)


### Bug Fixes

* **auth:** fix Google OAuth and magic-link redirecting to localhost/Supabase domain on native ([a206a2e](https://github.com/hashpass-tech/hashpass.tech/commit/a206a2ef3ff1f8f8ead12c5e71c8f458427bbc6e))





## [1.8.50](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.49...v1.8.50) (2026-06-19)


### Performance Improvements

* **ci:** skip pnpm install when lock file unchanged ([2d94b76](https://github.com/hashpass-tech/hashpass.tech/commit/2d94b76057c2e3ffcde39a16ea2612f3d426ce90))





## [1.8.49](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.48...v1.8.49) (2026-06-19)


### Bug Fixes

* **mobile:** make native toasts opaque and visually distinct ([c0110e4](https://github.com/hashpass-tech/hashpass.tech/commit/c0110e4ab7b45024e171125e591d7ef2d89a5e18)), closes [#1E1E1](https://github.com/hashpass-tech/hashpass.tech/issues/1E1E1) [#121212](https://github.com/hashpass-tech/hashpass.tech/issues/121212) [#2C2C2](https://github.com/hashpass-tech/hashpass.tech/issues/2C2C2)





## [1.8.48](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.47...v1.8.48) (2026-06-19)


### Performance Improvements

* **ci:** reduce Android build time — drop --stacktrace, add config cache ([b9b2939](https://github.com/hashpass-tech/hashpass.tech/commit/b9b2939af6474d96b7a5e8d7d33ad3b6949c6724))





## [1.8.47](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.46...v1.8.47) (2026-06-19)


### Bug Fixes

* **auth:** correct OAuth/magic-link redirect URL on native + center dialog ([7b650c4](https://github.com/hashpass-tech/hashpass.tech/commit/7b650c474de6824a170a5b3b27309cb55b574a0e))





## [1.8.46](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.45...v1.8.46) (2026-06-19)


### Bug Fixes

* **ci:** exclude version field from prebuild hash to enable incremental builds ([4db87bc](https://github.com/hashpass-tech/hashpass.tech/commit/4db87bc2f7f7752c47392f998b6f696b1347cdb2))





## [1.8.45](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.44...v1.8.45) (2026-06-19)


### Bug Fixes

* **landing:** correct hero logo in light mode and prevent tagline displacement ([6f650f4](https://github.com/hashpass-tech/hashpass.tech/commit/6f650f469b78b7aa2136d3a6e8463328a0526525))





## [1.8.44](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.43...v1.8.44) (2026-06-19)


### Bug Fixes

* **landing:** reserve tagline height to prevent logo displacement on load ([ecb8ca3](https://github.com/hashpass-tech/hashpass.tech/commit/ecb8ca39b78cdb0b05b3e8944de251ce45055786))





## [1.8.43](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.42...v1.8.43) (2026-06-19)


### Bug Fixes

* **ci:** cap Gradle heap at 3072 MiB on t3a.large to prevent OOM ([d2bfd0c](https://github.com/hashpass-tech/hashpass.tech/commit/d2bfd0c1ecdc70cc36054e5ae92efd7691c405d8))
* use pure white logo for footer on dark mode web for better contrast ([750b401](https://github.com/hashpass-tech/hashpass.tech/commit/750b401db1e4b03a28f01f8d81871389f0ddec91))





## [1.8.42](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.41...v1.8.42) (2026-06-19)


### Bug Fixes

* **auth:** guard window.localStorage access on native to fix Google OAuth and magic link ([50a44bd](https://github.com/hashpass-tech/hashpass.tech/commit/50a44bd007b2c043c2810efbd5731b5038cabf61))
* **ci:** add queue grace period to stop-runner before shutting down EC2 ([e9733b9](https://github.com/hashpass-tech/hashpass.tech/commit/e9733b96ba86787bfb0ddb7cc2e2b8648d9edd13))





## [1.8.41](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.40...v1.8.41) (2026-06-19)


### Bug Fixes

* filter out "null" string from window.location.origin on native ([9d0ef6f](https://github.com/hashpass-tech/hashpass.tech/commit/9d0ef6f10dd627081bc7b0f90bfbeb15633f5faf))
* include type augmentation files in partial typecheck temp dir ([328988d](https://github.com/hashpass-tech/hashpass.tech/commit/328988dcbf5a7411646faaf6a3dd37862bec96b6))





## [1.8.38](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.37...v1.8.38) (2026-06-19)





## [1.8.40] - 2026-06-19

### Released
- Version 1.8.40 release

### Technical Details
- Version: 1.8.40
- Release Type: stable
- Build Number: 202606190052
- Release Date: 2026-06-19T00:52:12.232Z


## [1.8.39] - 2026-06-19

### Released
- Version 1.8.39 release

### Technical Details
- Version: 1.8.39
- Release Type: stable
- Build Number: 202606190047
- Release Date: 2026-06-19T00:47:46.118Z


## [1.8.36](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.35...v1.8.36) (2026-06-18)





## [1.8.37] - 2026-06-19

### Released
- Fixed native light-mode auth contrast and web logo selection

### Technical Details
- Version: 1.8.37
- Release Type: stable
- Build Number: 202606190008
- Release Date: 2026-06-19T00:08:26.955Z


## [1.8.35](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.34...v1.8.35) (2026-06-18)

### Released
- Fixed native magic link and Google sign-in handling so callback codes are exchanged for a session on Android.
- Improved the native auth card layout and feedback messages so the flow stays centered and readable.
- Added regression tests for native Supabase redirect and OAuth code exchange.

## [1.8.34](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.33...v1.8.34) (2026-06-18)





## [1.8.33](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.32...v1.8.33) (2026-06-18)





## [1.8.32](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.31...v1.8.32) (2026-06-18)





## [1.8.28](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.27...v1.8.28) (2026-06-18)





## [1.8.31] - 2026-06-18

### Released
- Add focused mobile release typecheck gate

### Technical Details
- Version: 1.8.31
- Release Type: stable
- Build Number: 202606182046
- Release Date: 2026-06-18T20:46:55.217Z


## [1.8.30] - 2026-06-18

### Released
- Testimonials avatar crash fix

### Technical Details
- Version: 1.8.30
- Release Type: stable
- Build Number: 202606182026
- Release Date: 2026-06-18T20:26:46.872Z


## [1.8.29] - 2026-06-18

### Released
- Web hero subtitle contrast fix

### Technical Details
- Version: 1.8.29
- Release Type: stable
- Build Number: 202606181934
- Release Date: 2026-06-18T19:34:03.182Z


## [1.8.27](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.26...v1.8.27) (2026-06-18)





## [1.8.26](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.25...v1.8.26) (2026-06-18)


### Bug Fixes

* pass isDesktopLayout to getStyles to prevent startup crash on Android ([32c84c7](https://github.com/hashpass-tech/hashpass.tech/commit/32c84c7375abc43d217e2daaa79044d6edfb9976))





## [1.8.25](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.24...v1.8.25) (2026-06-18)


### Bug Fixes

* align supabase native callback ([bdb3b9d](https://github.com/hashpass-tech/hashpass.tech/commit/bdb3b9d488603343616e8358b98c4e1ad7337e72))





## [1.8.24](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.23...v1.8.24) (2026-06-18)


### Bug Fixes

* native auth screen layout, Google OAuth via WebBrowser, and Supabase env ([dab0db1](https://github.com/hashpass-tech/hashpass.tech/commit/dab0db12259083c9540c343eb41caa62657f79cf))





## [1.8.22](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.21...v1.8.22) (2026-06-18)


### Bug Fixes

* native landing page — transparent logos, scroll crash, FlipCard 3D, card layout ([140cb74](https://github.com/hashpass-tech/hashpass.tech/commit/140cb7404322422d54eed4a7a6cb1bd3f9fbc5c4))





## [1.8.23] - 2026-06-18

### Released
- Android launcher branding refresh: HASHPASS name and icon

### Technical Details
- Version: 1.8.23
- Release Type: stable
- Build Number: 202606181630
- Release Date: 2026-06-18T16:30:35.043Z


## [1.8.21](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.20...v1.8.21) (2026-06-18)





## [1.8.20](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.19...v1.8.20) (2026-06-18)


### Bug Fixes

* guard window APIs in useIsMobile and fix babel preset for web CI ([761b6cd](https://github.com/hashpass-tech/hashpass.tech/commit/761b6cdefcc901b7d3a0b47cae2330e0e4c197f5))





## [1.8.19](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.18...v1.8.19) (2026-06-18)


### Bug Fixes

* revert to original babel config for native builds ([d1bb33b](https://github.com/hashpass-tech/hashpass.tech/commit/d1bb33bcd3815703a801826f44fa028723328ac1))





## [1.8.18](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.17...v1.8.18) (2026-06-18)


### Bug Fixes

* restore reanimated-before-worklets babel plugin ordering on native ([df072b0](https://github.com/hashpass-tech/hashpass.tech/commit/df072b0ea05ac5baae96c34da8a6f27da9527532))





## [1.8.17](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.16...v1.8.17) (2026-06-18)





## [1.8.16](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.15...v1.8.16) (2026-06-18)


### Bug Fixes

* split GlowingEffect for native and fix babel web CI resolution ([b3bae78](https://github.com/hashpass-tech/hashpass.tech/commit/b3bae78170c4a021ab51ef43f53910c24cf72e91))





## [1.8.15](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.14...v1.8.15) (2026-06-18)


### Bug Fixes

* pre-resolve react-native-worklets/plugin in babel.config.js to fix CI web build ([7dda78a](https://github.com/hashpass-tech/hashpass.tech/commit/7dda78a84bec4f74e8519dfdde8fa5a5ed9fbc7a))





## [1.8.14](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.13...v1.8.14) (2026-06-17)


### Bug Fixes

* replace web-only HTML elements with React Native equivalents for Android ([ec939de](https://github.com/hashpass-tech/hashpass.tech/commit/ec939de429d4225017685c8b4ba57962241e0238))





## [1.8.13](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.12...v1.8.13) (2026-06-17)


### Bug Fixes

* clear Metro cache before Amplify builds to avoid stale absolute-path entries ([ee5f58d](https://github.com/hashpass-tech/hashpass.tech/commit/ee5f58de35473638390555dc8b048e3f841b810f))





## [1.8.12](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.11...v1.8.12) (2026-06-17)


### Bug Fixes

* align root package.json expo versions with mobile-app to fix duplicate lockfile entries ([eabcd01](https://github.com/hashpass-tech/hashpass.tech/commit/eabcd01028c20546f5014820df3dfce0c934daee))





## [1.8.11](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.10...v1.8.11) (2026-06-17)


### Bug Fixes

* **mobile:** replace LampBrandBanner framer-motion with native Image/View ([71c42b9](https://github.com/hashpass-tech/hashpass.tech/commit/71c42b95f277a734d625974ac76b6d07dc3f0696))





## [1.8.10](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.9...v1.8.10) (2026-06-17)


### Bug Fixes

* **mobile:** replace web-only Framer Motion components with native equivalents ([f86f4f9](https://github.com/hashpass-tech/hashpass.tech/commit/f86f4f9a1a8394448530048d37424800ccdb6cec))





## [1.8.9](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.8...v1.8.9) (2026-06-17)





## [1.8.8](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.7...v1.8.8) (2026-06-17)


### Bug Fixes

* **android-plugin:** resolve @expo/config-plugins through expo in pnpm workspace ([0d605dc](https://github.com/hashpass-tech/hashpass.tech/commit/0d605dc7fcd1adce292654d159d5fb409bd78692))
* **android:** move expo-dev-client to devDependencies to prevent launch crash ([531e33f](https://github.com/hashpass-tech/hashpass.tech/commit/531e33fda8ee1308bfae41bc650b4282c4a55c8f))
* **auth:** replace ? placeholder icons with wallet and globe on feature slides ([02fde23](https://github.com/hashpass-tech/hashpass.tech/commit/02fde231f705f01927454c4dd3a5b924e772d79d))
* downgrade framer-motion to 11.x for stability ([614a57b](https://github.com/hashpass-tech/hashpass.tech/commit/614a57b983bd5719f9df53968664cdf26ac4bcb2))
* resolve Android launch crash by aligning Expo SDK 53 package versions ([903e2cd](https://github.com/hashpass-tech/hashpass.tech/commit/903e2cd022cc714065ae0bad554dbaf82fc88d1e))





## [1.8.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.6...v1.8.7) (2026-06-17)


### Bug Fixes

* **android:** move react-native-worklets to devDependencies to prevent libworklets.so startup crash ([4ab9c2b](https://github.com/hashpass-tech/hashpass.tech/commit/4ab9c2b028b6c6a4efe1bad0c3b2563c7b0a869b))
* **auth:** show shader hero behind desktop left pane, keep text white ([a37a5da](https://github.com/hashpass-tech/hashpass.tech/commit/a37a5da275bf64781b2146de1166088507183819))
* **auth:** theme-aware Welcome/subtitle/back-arrow in desktop layout ([4fbfed3](https://github.com/hashpass-tech/hashpass.tech/commit/4fbfed3c4f36c236f8bb37c4799672496f2f2ae6)), closes [#eef0f5](https://github.com/hashpass-tech/hashpass.tech/issues/eef0f5)
* **mobile:** restore required worklets dep and disable New Architecture ([0f69b22](https://github.com/hashpass-tech/hashpass.tech/commit/0f69b222cea5f00b5fe98afc724015959b91b0bb))





## [1.8.6](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.5...v1.8.6) (2026-06-17)


### Bug Fixes

* add metro-cache as direct dep so FileStore is resolvable in pnpm ([a163706](https://github.com/hashpass-tech/hashpass.tech/commit/a1637060633ab230719159c33d4ae31d04c0ff4d))
* **auth:** force white color on back arrow, Welcome title, and subtitle ([0ef2ec6](https://github.com/hashpass-tech/hashpass.tech/commit/0ef2ec6fc3a3e4e3a9f3bad97cf2eece29bf1348))
* **mobile-ci:** fix Metro OOM, add incremental prebuild cache, EC2 idle shutdown + auto-start ([dfd450b](https://github.com/hashpass-tech/hashpass.tech/commit/dfd450b461ac5d4b7146d1dd283800fe7f469394))
* **mobile-ci:** increase EC2 idle shutdown timeout to 30 minutes ([a8f9aa7](https://github.com/hashpass-tech/hashpass.tech/commit/a8f9aa72b7dba149bfd4d50db6f2263ec9617db8))
* **mobile-ci:** set NODE_OPTIONS at job env level, restore Xmx4g for t3a.large ([0d305ce](https://github.com/hashpass-tech/hashpass.tech/commit/0d305ce00467c96010a494d5cb0a31bd318e8c5c))
* **mobile:** resolve Android launch crash from conflicting worklets native module ([e547f88](https://github.com/hashpass-tech/hashpass.tech/commit/e547f8826a67980c7ea64cbaf52324cc687e56f9))


### Features

* **mobile:** local Android signing via config/android-signing.env ([e5eabe0](https://github.com/hashpass-tech/hashpass.tech/commit/e5eabe0b938c4772f61d1179dce0d98cf5afefa9))


### Performance Improvements

* **mobile-ci:** persist Metro transform cache on EC2 EBS between builds ([4d33267](https://github.com/hashpass-tech/hashpass.tech/commit/4d332670a1495ce79cfce84069dea3e7dcb7bcc4))
* **mobile-ci:** raise heap limits for t3a.xlarge (16 GiB / 4 vCPU) ([9dd9b26](https://github.com/hashpass-tech/hashpass.tech/commit/9dd9b261f8aaa244b2f5db6cb93ab4b644779815))





## [1.8.5](https://github.com/hashpass-tech/hashpass.tech/compare/v1.8.4...v1.8.5) (2026-06-16)


### Bug Fixes

* **ci:** expose android gradle output in fastlane ([101f7b8](https://github.com/hashpass-tech/hashpass.tech/commit/101f7b8ef2492608890e815b91fae7d945511652))
* **ci:** install eas cli for expo releases ([f5d438f](https://github.com/hashpass-tech/hashpass.tech/commit/f5d438ffd07df48d9838f6346567969a8f4c5c4b))
* **ci:** make mobile release workflow parseable ([7425686](https://github.com/hashpass-tech/hashpass.tech/commit/7425686ac9e3f8d33c5d0b4c5d70d26160458c9a))
* **ci:** move mobile runner tool cache into writable path ([a199995](https://github.com/hashpass-tech/hashpass.tech/commit/a1999952171137013ed235f767e3f548af5a63fd))
* **ci:** use hosted tool cache on mobile runner ([7db26d4](https://github.com/hashpass-tech/hashpass.tech/commit/7db26d4cc8d31c152d52caedb724a5a48a7cac85))
* **mobile-release:** embed Supabase env at build time + optimize Gradle parallelism ([efc63a4](https://github.com/hashpass-tech/hashpass.tech/commit/efc63a4c99576e46547c7b0eab1a4364578b92c6))
* **mobile-release:** security hardening and dev build env fixes ([6bc8929](https://github.com/hashpass-tech/hashpass.tech/commit/6bc8929718137ab2a300b95765a5a4151e0d0f2a))


### Features

* **ci:** recover android signing secrets from expo ([f6b7666](https://github.com/hashpass-tech/hashpass.tech/commit/f6b76666b8bebddd8e31045809221ebdca3c0ea1))
* **ci:** resolve expo signing export by project id ([994580d](https://github.com/hashpass-tech/hashpass.tech/commit/994580dc6e3e6f99ba23abe101777d4be163f575))
* **infra:** add mobile release runner stack ([ea42faa](https://github.com/hashpass-tech/hashpass.tech/commit/ea42faa998d86e2f63f448b310cf0c0e982a5e6f))
* **infra:** harden mobile release workflow ([951fc74](https://github.com/hashpass-tech/hashpass.tech/commit/951fc7499122be22a88ec9ab912f761fdf3269a9))
* **mobile:** add self-hosted fastlane release path ([9141ef4](https://github.com/hashpass-tech/hashpass.tech/commit/9141ef4516bd94219e31dc9e417712fc81622dcc))
* **mobile:** default Android releases to fastlane ([3e222ff](https://github.com/hashpass-tech/hashpass.tech/commit/3e222ff2a60dde653aca8158838e04e752809f02))





## [1.8.0] - 2026-06-15

### Released
- Android startup crash fix and favicon refresh

### Technical Details
- Version: 1.8.0
- Release Type: stable
- Build Number: 202606151947
- Release Date: 2026-06-15T19:47:19.733Z


## [1.8.4] - 2026-06-16

### Released
- Harden Android startup hostname access and ship repository license/trademark docs

### Technical Details
- Version: 1.8.4
- Release Type: stable
- Build Number: 202606160417
- Release Date: 2026-06-16T04:17:46.643Z


## [1.8.3] - 2026-06-16

### Released
- Add startup version stamp, surface the React loading screen earlier, and fall back to injected commit metadata on mobile startup

### Technical Details
- Version: 1.8.3
- Release Type: stable
- Build Number: 202606160300
- Release Date: 2026-06-16T03:00:14.036Z


## [1.8.2] - 2026-06-16

### Released
- Fix mobile web black screen, update favicon URLs, and force Zustand middleware onto CJS for web rendering

### Technical Details
- Version: 1.8.2
- Release Type: stable
- Build Number: 202606160040
- Release Date: 2026-06-16T00:40:00.481Z


## [1.8.1] - 2026-06-15

### Released
- README badge and changelog sync guard

### Technical Details
- Version: 1.8.1
- Release Type: stable
- Build Number: 202606152327
- Release Date: 2026-06-15T23:27:34.521Z


## [1.7.9] - 2026-06-10

### Released
- Version 1.7.9 release

### Technical Details
- Version: 1.7.9
- Release Type: stable
- Build Number: 202606100333
- Release Date: 2026-06-10T03:33:22.352Z


## [1.7.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.7-dev.4...v1.7.7) (2026-06-10)


### Bug Fixes

* clean node_modules before infra install ([de4fc7e](https://github.com/hashpass-tech/hashpass.tech/commit/de4fc7e7ef82b98a332a5f319999c8733ff8ef14))
* clear node_modules before amplify install ([a0bbff3](https://github.com/hashpass-tech/hashpass.tech/commit/a0bbff3b6f2b77e4c83bfa5e6eec0bb0e5f5f048))
* publish bsl supabase runtime profiles ([9aa9424](https://github.com/hashpass-tech/hashpass.tech/commit/9aa9424b30f518d90ee7a924fddd31da0694dd8c))
* restore amplify postBuild deploy step ([71d291f](https://github.com/hashpass-tech/hashpass.tech/commit/71d291f65c1b08199ec38a41de6ddbed1bc83303))
* use postgres health checks for api status ([501a23c](https://github.com/hashpass-tech/hashpass.tech/commit/501a23c07a9c7eb3840542da6139994f4ddb9fe6))





## [1.7.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.7-dev.2...v1.7.7) (2026-06-05)





## [1.7.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.7-dev.2...v1.7.7) (2026-06-05)





## [1.7.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.6-dev.4...v1.7.7) (2026-06-05)





## [1.7.7](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.6-dev.4...v1.7.7) (2026-06-05)





## [1.7.6](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.6-dev.2...v1.7.6) (2026-05-14)


### Bug Fixes

* sync BSL auth env paths ([02de787](https://github.com/hashpass-tech/hashpass.tech/commit/02de787634941afafefa0d3da9257f66e82d5297))





## [1.7.7] - 2026-05-14

### Beta
- Version 1.7.7 release

### Technical Details
- Version: 1.7.7
- Release Type: beta
- Build Number: 202605140233
- Release Date: 2026-05-14T02:33:37.574Z


## [1.7.6](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.6-dev.2...v1.7.6) (2026-05-14)


### Bug Fixes

* sync BSL auth env paths ([02de787](https://github.com/hashpass-tech/hashpass.tech/commit/02de787634941afafefa0d3da9257f66e82d5297))





## [1.7.6](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.6-dev.1...v1.7.6) (2026-05-13)







## [1.7.5](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.4-dev.3...v1.7.5) (2026-05-11)





## [1.7.6] - 2026-05-12

### Beta
- Generic /api/auth routing and tenant-aware auth flow

### Technical Details
- Version: 1.7.6
- Release Type: beta
- Build Number: 202605120032
- Release Date: 2026-05-12T00:32:52.460Z


## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.4-dev.3...v1.7.4) (2026-05-11)





## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.4-dev.2...v1.7.4) (2026-05-11)





## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3-dev.2...v1.7.4) (2026-05-11)


### Bug Fixes

* Improve PWA icon resolution with proper require fallback ([8a54c8f](https://github.com/hashpass-tech/hashpass.tech/commit/8a54c8f763a2bad3b0b7f1ef410dd2cd025b25cc))
* Properly resolve PWA icon URIs with correct web fallbacks ([74a3a8e](https://github.com/hashpass-tech/hashpass.tech/commit/74a3a8e70c794a485f97936937e9fabd4c6ea524))


### Features

* Add "don't show again" checkbox to PWA install modal ([4174a2a](https://github.com/hashpass-tech/hashpass.tech/commit/4174a2a1d051b32cb902dd06af822d0c4568bcf8))
* Add "don't show again" checkbox to PWA modal footer and fix icon loading ([934c0cb](https://github.com/hashpass-tech/hashpass.tech/commit/934c0cb017c439b54d92397e59fcb0bfa859971b))



## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3...v1.7.4) (2026-05-10)





## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3-dev.2...v1.7.4) (2026-05-11)


### Bug Fixes

* Improve PWA icon resolution with proper require fallback ([8a54c8f](https://github.com/hashpass-tech/hashpass.tech/commit/8a54c8f763a2bad3b0b7f1ef410dd2cd025b25cc))
* Properly resolve PWA icon URIs with correct web fallbacks ([74a3a8e](https://github.com/hashpass-tech/hashpass.tech/commit/74a3a8e70c794a485f97936937e9fabd4c6ea524))


### Features

* Add "don't show again" checkbox to PWA install modal ([4174a2a](https://github.com/hashpass-tech/hashpass.tech/commit/4174a2a1d051b32cb902dd06af822d0c4568bcf8))
* Add "don't show again" checkbox to PWA modal footer and fix icon loading ([934c0cb](https://github.com/hashpass-tech/hashpass.tech/commit/934c0cb017c439b54d92397e59fcb0bfa859971b))



## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3...v1.7.4) (2026-05-10)





## [1.7.4](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3...v1.7.4) (2026-05-10)

## [1.7.3-dev.2](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.3-dev.1...v1.7.3-dev.2) (2026-05-11)


### Bug Fixes

* branch-aware prod version and pwa open state ([f1feb09](https://github.com/hashpass-tech/hashpass.tech/commit/f1feb090c48b19858552aa1bdb791961a1dbe624))
* bundle pwa version runtime files ([159f639](https://github.com/hashpass-tech/hashpass.tech/commit/159f639bf1d4f5d8c3304f9b1bc91d5bef869202))


### Features

* make version display branch aware ([db00892](https://github.com/hashpass-tech/hashpass.tech/commit/db0089282c7050754f3e2ada6e43609a921a07d3))

## [1.7.3](https://github.com/hashpass-tech/hashpass.tech/compare/v1.7.2...v1.7.3) (2026-05-10)


### Bug Fixes

* **pwa:** improve native install prompt handling with proper debugging ([b67b57a](https://github.com/hashpass-tech/hashpass.tech/commit/b67b57a9d89d73602aaa510e95543d72aa7c784e))
* **pwa:** properly contain modal with width constraints and prevent overflow ([2156c20](https://github.com/hashpass-tech/hashpass.tech/commit/2156c2086e4e8f4d7e0beb0ab5bf6e13f757ade4))
* **pwa:** remove alert fallback and show install modal instead ([1455422](https://github.com/hashpass-tech/hashpass.tech/commit/1455422375ea92536bbe067af7c7d7f850d5eebb))
* **pwa:** remove white background and add proper mobile variants ([7c40406](https://github.com/hashpass-tech/hashpass.tech/commit/7c4040612ff4c4ac1859b7543659761c85fdf37d))


### Features

* **pwa:** redesign mobile modal as bottom sheet for better UX ([dcd09da](https://github.com/hashpass-tech/hashpass.tech/commit/dcd09dadb4234df052fc5beb6dedc39a6d0f7bd1))





# Changelog

## [1.7.2] - 2026-05-10

### Beta
- Version 1.7.2 release

### Technical Details
- Version: 1.7.2
- Release Type: beta
- Build Number: 202605100823
- Release Date: 2026-05-10T08:23:34.749Z


## [1.7.1] - 2026-05-10

### Released
- Version 1.7.1 release

### Technical Details
- Version: 1.7.1
- Release Type: stable
- Build Number: 202605100720
- Release Date: 2026-05-10T07:20:24.278Z


## [1.7.0] - 2026-05-10

### Released
- Version 1.7.0 release

### Technical Details
- Version: 1.7.0
- Release Type: stable
- Build Number: 202605100708
- Release Date: 2026-05-10T07:08:04.743Z


## [1.6.135] - 2026-05-10

### Released
- Version 1.6.135 release

### Technical Details
- Version: 1.6.135
- Release Type: stable
- Build Number: 202605100702
- Release Date: 2026-05-10T07:02:25.047Z


## [1.6.134] - 2026-05-09

### Released
- Version 1.6.134 release

### Technical Details
- Version: 1.6.134
- Release Type: stable
- Build Number: 202605091949
- Release Date: 2026-05-09T19:49:12.746Z


## [1.6.133] - 2026-05-09

### Released
- Version 1.6.133 release

### Technical Details
- Version: 1.6.133
- Release Type: stable
- Build Number: 202605091909
- Release Date: 2026-05-09T19:09:20.324Z


## [1.6.132] - 2026-05-09

### Released
- Version 1.6.132 release

### Technical Details
- Version: 1.6.132
- Release Type: stable
- Build Number: 202605091717
- Release Date: 2026-05-09T17:17:34.560Z


## [1.6.131] - 2026-05-09

### Released
- Version 1.6.131 release

### Technical Details
- Version: 1.6.131
- Release Type: stable
- Build Number: 202605091631
- Release Date: 2026-05-09T16:31:46.309Z


## [1.6.130] - 2026-05-08

### Released
- Version 1.6.130 release

### Technical Details
- Version: 1.6.130
- Release Type: stable
- Build Number: 202605082041
- Release Date: 2026-05-08T20:41:04.625Z


## [1.6.129] - 2026-05-08

### Released
- Version 1.6.129 release

### Technical Details
- Version: 1.6.129
- Release Type: stable
- Build Number: 202605081554
- Release Date: 2026-05-08T15:54:33.840Z


## [1.6.128] - 2026-05-08

### Released
- Version 1.6.128 release

### Technical Details
- Version: 1.6.128
- Release Type: stable
- Build Number: 202605081547
- Release Date: 2026-05-08T15:47:42.564Z


## [1.6.127] - 2026-02-23

### Beta
- Version 1.6.127 release

### Technical Details
- Version: 1.6.127
- Release Type: beta
- Build Number: 202602230129
- Release Date: 2026-02-23T01:29:51.022Z


## [1.6.126] - 2026-02-23

### Beta
- Version 1.6.126 release

### Technical Details
- Version: 1.6.126
- Release Type: beta
- Build Number: 202602230047
- Release Date: 2026-02-23T00:47:46.998Z


## [1.6.125] - 2026-02-23

### Beta
- Landing UI polish: footer animated gradient, feature cards dark-mode/CTA consistency, and hover behavior fixes

### Technical Details
- Version: 1.6.125
- Release Type: beta
- Build Number: 202602230002
- Release Date: 2026-02-23T00:02:50.476Z


## [1.6.124] - 2026-02-22

### Beta
- Version 1.6.124 release

### Technical Details
- Version: 1.6.124
- Release Type: beta
- Build Number: 202602222150
- Release Date: 2026-02-22T21:50:09.491Z


## [1.6.123] - 2026-02-22

### Beta
- Version 1.6.123 release

### Technical Details
- Version: 1.6.123
- Release Type: beta
- Build Number: 202602222148
- Release Date: 2026-02-22T21:48:41.776Z


## [1.6.122] - 2026-02-22

### Beta
- Version 1.6.122 release

### Technical Details
- Version: 1.6.122
- Release Type: beta
- Build Number: 202602222107
- Release Date: 2026-02-22T21:07:01.269Z


## [1.6.121] - 2026-02-22

### Beta
- Version 1.6.121 release

### Technical Details
- Version: 1.6.121
- Release Type: beta
- Build Number: 202602222101
- Release Date: 2026-02-22T21:01:31.181Z


## [1.6.120] - 2026-02-22

### Beta
- Version 1.6.120 release

### Technical Details
- Version: 1.6.120
- Release Type: beta
- Build Number: 202602222045
- Release Date: 2026-02-22T20:45:09.201Z


## [1.6.119] - 2026-02-22

### Beta
- Version 1.6.119 release

### Technical Details
- Version: 1.6.119
- Release Type: beta
- Build Number: 202602222023
- Release Date: 2026-02-22T20:23:52.849Z


## [1.6.118] - 2026-02-22

### Beta
- Version 1.6.118 release

### Technical Details
- Version: 1.6.118
- Release Type: beta
- Build Number: 202602221954
- Release Date: 2026-02-22T19:54:49.622Z


## [1.6.117] - 2026-02-22

### Beta
- Version 1.6.117 release

### Technical Details
- Version: 1.6.117
- Release Type: beta
- Build Number: 202602220533
- Release Date: 2026-02-22T05:33:39.753Z


## [1.6.116] - 2026-02-22

### Beta
- Version 1.6.116 release

### Technical Details
- Version: 1.6.116
- Release Type: beta
- Build Number: 202602220434
- Release Date: 2026-02-22T04:34:07.394Z


## [1.6.115] - 2026-02-22

### Beta
- Version 1.6.115 release

### Technical Details
- Version: 1.6.115
- Release Type: beta
- Build Number: 202602220345
- Release Date: 2026-02-22T03:45:15.094Z


## [1.6.114] - 2026-02-19

### Beta
- Version 1.6.114 release

### Technical Details
- Version: 1.6.114
- Release Type: beta
- Build Number: 202602190745
- Release Date: 2026-02-19T07:45:00.000Z


## [1.6.113] - 2025-11-26

### Beta
- Version 1.6.113 release

### Technical Details
- Version: 1.6.113
- Release Type: beta
- Build Number: 202511261143
- Release Date: 2025-11-26T11:43:42.099Z


## [1.6.112] - 2025-11-26

### Beta
- Version 1.6.112 release

### Technical Details
- Version: 1.6.112
- Release Type: beta
- Build Number: 202511261115
- Release Date: 2025-11-26T11:15:20.483Z


## [1.6.111] - 2025-11-26

### Beta
- Version 1.6.111 release

### Technical Details
- Version: 1.6.111
- Release Type: beta
- Build Number: 202511261059
- Release Date: 2025-11-26T10:59:18.691Z


## [1.6.110] - 2025-11-26

### Beta
- Version 1.6.110 release

### Technical Details
- Version: 1.6.110
- Release Type: beta
- Build Number: 202511261035
- Release Date: 2025-11-26T10:35:34.255Z


## [1.6.109] - 2025-11-26

### Beta
- Version 1.6.109 release

### Technical Details
- Version: 1.6.109
- Release Type: beta
- Build Number: 202511260947
- Release Date: 2025-11-26T09:47:04.457Z


## [1.6.108] - 2025-11-26

### Beta
- Version 1.6.108 release

### Technical Details
- Version: 1.6.108
- Release Type: beta
- Build Number: 202511260943
- Release Date: 2025-11-26T09:43:48.843Z


## [1.6.107] - 2025-11-26

### Beta
- Version 1.6.107 release

### Technical Details
- Version: 1.6.107
- Release Type: beta
- Build Number: 202511260928
- Release Date: 2025-11-26T09:28:30.352Z


## [1.6.106] - 2025-11-17

### Beta
- Version 1.6.106 release

### Technical Details
- Version: 1.6.106
- Release Type: beta
- Build Number: 202511171850
- Release Date: 2025-11-17T18:50:17.093Z


## [1.6.105] - 2025-11-17

### Beta
- Version 1.6.105 release

### Technical Details
- Version: 1.6.105
- Release Type: beta
- Build Number: 202511171753
- Release Date: 2025-11-17T17:53:35.794Z


## [1.6.104] - 2025-11-17

### Beta
- Version 1.6.104 release

### Technical Details
- Version: 1.6.104
- Release Type: beta
- Build Number: 202511171734
- Release Date: 2025-11-17T17:34:36.256Z


## [1.6.103] - 2025-11-17

### Beta
- Version 1.6.103 release

### Technical Details
- Version: 1.6.103
- Release Type: beta
- Build Number: 202511170148
- Release Date: 2025-11-17T01:48:11.083Z


## [1.6.102] - 2025-11-16

### Beta
- Fixed

### Technical Details
- Version: 1.6.102
- Release Type: beta
- Build Number: 202511161830
- Release Date: 2025-11-16T18:30:16.259Z


## [1.6.101] - 2025-11-15

### Beta
- Fixed

### Technical Details
- Version: 1.6.101
- Release Type: beta
- Build Number: 202511152100
- Release Date: 2025-11-15T21:00:04.074Z


## [1.6.100] - 2025-11-15

### Beta
- Fixed

### Technical Details
- Version: 1.6.100
- Release Type: beta
- Build Number: 202511152034
- Release Date: 2025-11-15T20:34:45.700Z


## [1.6.99] - 2025-11-15

### Beta
- Integrated

### Technical Details
- Version: 1.6.99
- Release Type: beta
- Build Number: 202511152006
- Release Date: 2025-11-15T20:06:21.263Z


## [1.6.98] - 2025-11-15

### Beta
- Event

### Technical Details
- Version: 1.6.98
- Release Type: beta
- Build Number: 202511151921
- Release Date: 2025-11-15T19:21:46.027Z


## [1.6.97] - 2025-11-14

### Beta
- Version 1.6.97 release

### Technical Details
- Version: 1.6.97
- Release Type: beta
- Build Number: 202511141248
- Release Date: 2025-11-14T12:48:12.425Z


## [1.6.96] - 2025-11-14

### Beta
- Version 1.6.96 release

### Technical Details
- Version: 1.6.96
- Release Type: beta
- Build Number: 202511141246
- Release Date: 2025-11-14T12:46:00.659Z


## [1.6.95] - 2025-11-14

### Beta
- Version 1.6.95 release

### Technical Details
- Version: 1.6.95
- Release Type: beta
- Build Number: 202511141225
- Release Date: 2025-11-14T12:25:40.248Z


## [1.6.94] - 2025-11-14

### Beta
- Version 1.6.94 release

### Technical Details
- Version: 1.6.94
- Release Type: beta
- Build Number: 202511141207
- Release Date: 2025-11-14T12:07:45.052Z


## [1.6.93] - 2025-11-14

### Beta
- Version 1.6.93 release

### Technical Details
- Version: 1.6.93
- Release Type: beta
- Build Number: 202511141147
- Release Date: 2025-11-14T11:47:39.426Z


## [1.6.90] - 2025-11-14

### Beta
- Version 1.6.90 release

### Technical Details
- Version: 1.6.90
- Release Type: beta
- Build Number: 202511141000
- Release Date: 2025-11-14T10:00:19.989Z


## [1.6.88] - 2025-11-14

### Beta
- Version 1.6.88 release

### Technical Details
- Version: 1.6.88
- Release Type: beta
- Build Number: 202511140839
- Release Date: 2025-11-14T08:39:11.714Z


## [1.6.87] - 2025-11-14

### Beta
- Version 1.6.87 release

### Technical Details
- Version: 1.6.87
- Release Type: beta
- Build Number: 202511140756
- Release Date: 2025-11-14T07:56:52.306Z


## [1.6.86] - 2025-11-14

### Beta
- Version 1.6.86 release

### Technical Details
- Version: 1.6.86
- Release Type: beta
- Build Number: 202511140650
- Release Date: 2025-11-14T06:50:29.389Z


## [1.6.85] - 2025-11-14

### Beta
- Version 1.6.85 release

### Technical Details
- Version: 1.6.85
- Release Type: beta
- Build Number: 202511140626
- Release Date: 2025-11-14T06:26:03.486Z


## [1.6.84] - 2025-11-14

### Beta
- Version 1.6.84 release

### Technical Details
- Version: 1.6.84
- Release Type: beta
- Build Number: 202511140509
- Release Date: 2025-11-14T05:09:12.089Z


## [1.6.83] - 2025-11-14

### Beta
- Version 1.6.83 release

### Technical Details
- Version: 1.6.83
- Release Type: beta
- Build Number: 202511140507
- Release Date: 2025-11-14T05:07:12.887Z


## [1.6.81] - 2025-11-14

### Beta
- Updated

### Technical Details
- Version: 1.6.81
- Release Type: beta
- Build Number: 202511140404
- Release Date: 2025-11-14T04:04:29.586Z


## [1.6.80] - 2025-11-14

### Beta
- Updated

### Technical Details
- Version: 1.6.80
- Release Type: beta
- Build Number: 202511140402
- Release Date: 2025-11-14T04:02:00.095Z


## [1.6.79] - 2025-11-14

### Beta
- Version 1.6.79 release

### Technical Details
- Version: 1.6.79
- Release Type: beta
- Build Number: 202511140142
- Release Date: 2025-11-14T01:42:25.560Z


## [1.6.78] - 2025-11-13

### Beta
- Version 1.6.78 release

### Technical Details
- Version: 1.6.78
- Release Type: beta
- Build Number: 202511132154
- Release Date: 2025-11-13T21:54:30.613Z


## [1.6.77] - 2025-11-13

### Beta
- Version 1.6.77 release

### Technical Details
- Version: 1.6.77
- Release Type: beta
- Build Number: 202511132133
- Release Date: 2025-11-13T21:33:56.544Z


## [1.6.76] - 2025-11-13

### Beta
- Version 1.6.76 release

### Technical Details
- Version: 1.6.76
- Release Type: beta
- Build Number: 202511132114
- Release Date: 2025-11-13T21:14:50.752Z


## [1.6.73] - 2025-11-13

### Beta
- Version 1.6.73 release

### Technical Details
- Version: 1.6.73
- Release Type: beta
- Build Number: 202511131938
- Release Date: 2025-11-13T19:38:32.505Z


## [1.6.72] - 2025-11-13

### Beta
- Version 1.6.72 release

### Technical Details
- Version: 1.6.72
- Release Type: beta
- Build Number: 202511131925
- Release Date: 2025-11-13T19:25:27.251Z


## [1.6.71] - 2025-11-13

### Beta
- Version 1.6.71 release

### Technical Details
- Version: 1.6.71
- Release Type: beta
- Build Number: 202511131845
- Release Date: 2025-11-13T18:45:57.690Z


## [1.6.70] - 2025-11-13

### Beta
- Version 1.6.70 release

### Technical Details
- Version: 1.6.70
- Release Type: beta
- Build Number: 202511131825
- Release Date: 2025-11-13T18:25:55.968Z


## [1.6.69] - 2025-11-13

### Beta
- Version 1.6.69 release

### Technical Details
- Version: 1.6.69
- Release Type: beta
- Build Number: 202511131746
- Release Date: 2025-11-13T17:46:06.956Z


## [1.6.68] - 2025-11-13

### Beta
- Version 1.6.68 release

### Technical Details
- Version: 1.6.68
- Release Type: beta
- Build Number: 202511131739
- Release Date: 2025-11-13T17:39:53.108Z


## [1.6.67] - 2025-11-13

### Beta
- Version 1.6.67 release

### Technical Details
- Version: 1.6.67
- Release Type: beta
- Build Number: 202511131712
- Release Date: 2025-11-13T17:12:26.817Z


## [1.6.65] - 2025-11-13

### Beta
- Version 1.6.65 release

### Technical Details
- Version: 1.6.65
- Release Type: beta
- Build Number: 202511131611
- Release Date: 2025-11-13T16:11:07.148Z


## [1.6.64] - 2025-11-13

### Beta
- Version 1.6.64 release

### Technical Details
- Version: 1.6.64
- Release Type: beta
- Build Number: 202511131557
- Release Date: 2025-11-13T15:57:34.803Z


## [1.6.57] - 2025-11-12

### Beta
- Version 1.6.57 release

### Technical Details
- Version: 1.6.57
- Release Type: beta
- Build Number: 202511122205
- Release Date: 2025-11-12T22:05:08.309Z


## [1.6.56] - 2025-11-12

### Beta
- Version 1.6.56 release

### Technical Details
- Version: 1.6.56
- Release Type: beta
- Build Number: 202511122157
- Release Date: 2025-11-12T21:57:13.367Z


## [1.6.55] - 2025-11-12

### Beta
- Version 1.6.55 release

### Technical Details
- Version: 1.6.55
- Release Type: beta
- Build Number: 202511122142
- Release Date: 2025-11-12T21:42:55.583Z


## [1.6.54] - 2025-11-12

### Beta
- Version 1.6.54 release

### Technical Details
- Version: 1.6.54
- Release Type: beta
- Build Number: 202511122138
- Release Date: 2025-11-12T21:38:43.163Z


## [1.6.53] - 2025-11-12

### Beta
- Version 1.6.53 release

### Technical Details
- Version: 1.6.53
- Release Type: beta
- Build Number: 202511122104
- Release Date: 2025-11-12T21:04:40.518Z


## [1.6.52] - 2025-11-12

### Beta
- Version 1.6.52 release

### Technical Details
- Version: 1.6.52
- Release Type: beta
- Build Number: 202511122042
- Release Date: 2025-11-12T20:42:13.512Z


## [1.6.51] - 2025-11-12

### Beta
- Version 1.6.51 release

### Technical Details
- Version: 1.6.51
- Release Type: beta
- Build Number: 202511122033
- Release Date: 2025-11-12T20:33:43.475Z


## [1.6.50] - 2025-11-12

### Bugfixes
- Fixed OTP verification redirect issue on production
- Added session verification before navigation after OTP verification
- Improved redirect timing to ensure session is fully established
- Added proper loading state management during OTP verification

### Technical Details
- Version: 1.6.50
- Release Type: beta
- Build Number: 202511121501
- Release Date: 2025-11-12T15:01:00.000Z

## [1.6.49] - 2025-11-12

### Beta
- Version 1.6.49 release

### Technical Details
- Version: 1.6.49
- Release Type: beta
- Build Number: 202511121924
- Release Date: 2025-11-12T19:24:31.799Z


## [1.6.48] - 2025-11-12

### Beta
- Version 1.6.48 release

### Technical Details
- Version: 1.6.48
- Release Type: beta
- Build Number: 202511121902
- Release Date: 2025-11-12T19:02:41.629Z


## [1.6.47] - 2025-11-12

### Beta
- Version 1.6.47 release

### Technical Details
- Version: 1.6.47
- Release Type: beta
- Build Number: 202511121745
- Release Date: 2025-11-12T17:45:30.861Z


## [1.6.46] - 2025-11-12

### Beta
- Version 1.6.46 release

### Technical Details
- Version: 1.6.46
- Release Type: beta
- Build Number: 202511121704
- Release Date: 2025-11-12T17:04:03.598Z


## [1.6.45] - 2025-11-12

### Beta
- Version 1.6.45 release

### Technical Details
- Version: 1.6.45
- Release Type: beta
- Build Number: 202511121456
- Release Date: 2025-11-12T14:56:02.653Z


## [1.6.44] - 2025-11-12

### Beta
- Version 1.6.44 release

### Technical Details
- Version: 1.6.44
- Release Type: beta
- Build Number: 202511121434
- Release Date: 2025-11-12T14:34:27.425Z


## [1.6.43] - 2025-11-12

### Beta
- Version 1.6.43 release

### Technical Details
- Version: 1.6.43
- Release Type: beta
- Build Number: 202511121339
- Release Date: 2025-11-12T13:39:50.053Z


## [1.6.42] - 2025-11-12

### Beta
- Version 1.6.42 release

### Technical Details
- Version: 1.6.42
- Release Type: beta
- Build Number: 202511121336
- Release Date: 2025-11-12T13:36:52.525Z


## [1.6.41] - 2025-11-12

### Beta
- Version 1.6.41 release

### Technical Details
- Version: 1.6.41
- Release Type: beta
- Build Number: 202511121314
- Release Date: 2025-11-12T13:14:18.837Z


## [1.6.40] - 2025-11-12

### Beta
- Version 1.6.40 release

### Technical Details
- Version: 1.6.40
- Release Type: beta
- Build Number: 202511121310
- Release Date: 2025-11-12T13:10:44.821Z


## [1.6.39] - 2025-11-12

### Beta
- Version 1.6.39 release

### Technical Details
- Version: 1.6.39
- Release Type: beta
- Build Number: 202511121245
- Release Date: 2025-11-12T12:45:13.527Z


## [1.6.38] - 2025-11-12

### Beta
- Version 1.6.38 release

### Technical Details
- Version: 1.6.38
- Release Type: beta
- Build Number: 202511121240
- Release Date: 2025-11-12T12:40:43.966Z


## [1.6.37] - 2025-11-12

### Beta
- Version 1.6.37 release

### Technical Details
- Version: 1.6.37
- Release Type: beta
- Build Number: 202511121223
- Release Date: 2025-11-12T12:23:39.500Z


## [1.6.36] - 2025-11-12

### Beta
- Version 1.6.36 release

### Technical Details
- Version: 1.6.36
- Release Type: beta
- Build Number: 202511120906
- Release Date: 2025-11-12T09:06:27.043Z


## [1.6.35] - 2025-11-12

### Beta
- Version 1.6.35 release

### Technical Details
- Version: 1.6.35
- Release Type: beta
- Build Number: 202511120857
- Release Date: 2025-11-12T08:57:15.132Z


## [1.6.34] - 2025-11-12

### Beta
- Version 1.6.34 release

### Technical Details
- Version: 1.6.34
- Release Type: beta
- Build Number: 202511120834
- Release Date: 2025-11-12T08:34:15.759Z


## [1.6.33] - 2025-11-12

### Beta
- Version 1.6.33 release

### Technical Details
- Version: 1.6.33
- Release Type: beta
- Build Number: 202511120823
- Release Date: 2025-11-12T08:23:21.747Z


## [1.6.32] - 2025-11-12

### Beta
- Version 1.6.32 release

### Technical Details
- Version: 1.6.32
- Release Type: beta
- Build Number: 202511120758
- Release Date: 2025-11-12T07:58:13.873Z


## [1.6.31] - 2025-11-12

### Beta
- Version 1.6.31 release

### Technical Details
- Version: 1.6.31
- Release Type: beta
- Build Number: 202511120733
- Release Date: 2025-11-12T07:33:55.096Z


## [1.6.30] - 2025-11-12

### Beta
- Version 1.6.30 release

### Technical Details
- Version: 1.6.30
- Release Type: beta
- Build Number: 202511120648
- Release Date: 2025-11-12T06:48:40.510Z


## [1.6.29] - 2025-11-12

### Beta
- Version 1.6.29 release

### Technical Details
- Version: 1.6.29
- Release Type: beta
- Build Number: 202511120601
- Release Date: 2025-11-12T06:01:48.622Z


## [1.6.28] - 2025-11-12

### Beta
- Version 1.6.28 release

### Technical Details
- Version: 1.6.28
- Release Type: beta
- Build Number: 202511120547
- Release Date: 2025-11-12T05:47:58.756Z


## [1.6.27] - 2025-11-12

### Beta
- Version 1.6.27 release

### Technical Details
- Version: 1.6.27
- Release Type: beta
- Build Number: 202511120508
- Release Date: 2025-11-12T05:08:14.765Z


## [1.6.26] - 2025-11-12

### Beta
- Version 1.6.26 release

### Technical Details
- Version: 1.6.26
- Release Type: beta
- Build Number: 202511120452
- Release Date: 2025-11-12T04:52:42.788Z


## [1.6.25] - 2025-11-12

### Beta
- Version 1.6.25 release

### Technical Details
- Version: 1.6.25
- Release Type: beta
- Build Number: 202511120431
- Release Date: 2025-11-12T04:31:02.148Z


## [1.6.24] - 2025-11-12

### Beta
- Version 1.6.24 release

### Technical Details
- Version: 1.6.24
- Release Type: beta
- Build Number: 202511120415
- Release Date: 2025-11-12T04:15:41.199Z


## [1.6.23] - 2025-11-12

### Beta
- Version 1.6.23 release

### Technical Details
- Version: 1.6.23
- Release Type: beta
- Build Number: 202511120313
- Release Date: 2025-11-12T03:13:03.444Z


## [1.6.22] - 2025-11-12

### Beta
- Version 1.6.22 release

### Technical Details
- Version: 1.6.22
- Release Type: beta
- Build Number: 202511120256
- Release Date: 2025-11-12T02:56:04.796Z


## [1.6.21] - 2025-11-12

### Beta
- Version 1.6.21 release

### Technical Details
- Version: 1.6.21
- Release Type: beta
- Build Number: 202511120045
- Release Date: 2025-11-12T00:45:07.173Z


## [1.6.20] - 2025-11-12

### Beta
- Version 1.6.20 release

### Technical Details
- Version: 1.6.20
- Release Type: beta
- Build Number: 202511120030
- Release Date: 2025-11-12T00:30:13.071Z


## [1.6.19] - 2025-11-11

### Beta
- Version 1.6.19 release

### Technical Details
- Version: 1.6.19
- Release Type: beta
- Build Number: 202511112015
- Release Date: 2025-11-11T20:15:18.971Z


## [1.6.18] - 2025-11-11

### Beta
- Version 1.6.18 release

### Technical Details
- Version: 1.6.18
- Release Type: beta
- Build Number: 202511111958
- Release Date: 2025-11-11T19:58:03.659Z


## [1.6.17] - 2025-11-11

### Beta
- Version 1.6.17 release

### Technical Details
- Version: 1.6.17
- Release Type: beta
- Build Number: 202511111952
- Release Date: 2025-11-11T19:52:36.855Z


## [1.6.16] - 2025-11-11

### Beta
- Version 1.6.16 release

### Technical Details
- Version: 1.6.16
- Release Type: beta
- Build Number: 202511111952
- Release Date: 2025-11-11T19:52:03.535Z


## [1.6.14] - 2025-11-11

### Beta
- Version 1.6.14 release

### Technical Details
- Version: 1.6.14
- Release Type: beta
- Build Number: 202511110654
- Release Date: 2025-11-11T06:54:21.289Z


## [1.6.13] - 2025-11-11

### Beta
- Version 1.6.13 release

### Technical Details
- Version: 1.6.13
- Release Type: beta
- Build Number: 202511110640
- Release Date: 2025-11-11T06:40:58.810Z


## [1.6.12] - 2025-11-11

### Beta
- Version 1.6.12 release

### Technical Details
- Version: 1.6.12
- Release Type: beta
- Build Number: 202511110614
- Release Date: 2025-11-11T06:14:55.983Z


## [1.6.11] - 2025-11-10

### Beta
- Version 1.6.11 release

### Technical Details
- Version: 1.6.11
- Release Type: beta
- Build Number: 202511102042
- Release Date: 2025-11-10T20:42:38.250Z


## [1.6.10] - 2025-11-10

### Beta
- Version 1.6.10 release

### Technical Details
- Version: 1.6.10
- Release Type: beta
- Build Number: 202511101904
- Release Date: 2025-11-10T19:04:53.636Z


## [1.6.9] - 2025-11-10

### Beta
- Version 1.6.9 release

### Technical Details
- Version: 1.6.9
- Release Type: beta
- Build Number: 202511101015
- Release Date: 2025-11-10T10:15:55.719Z


## [1.6.8] - 2025-11-10

### Beta
- Version 1.6.8 release

### Technical Details
- Version: 1.6.8
- Release Type: beta
- Build Number: 202511100828
- Release Date: 2025-11-10T08:28:03.141Z


## [1.6.7] - 2025-11-09

### Beta
- Storybook

### Technical Details
- Version: 1.6.7
- Release Type: beta
- Build Number: 202511092344
- Release Date: 2025-11-09T23:44:28.244Z


## [1.6.6] - 2025-11-09

### Beta
- Version 1.6.6 release

### Technical Details
- Version: 1.6.6
- Release Type: beta
- Build Number: 202511092132
- Release Date: 2025-11-09T21:32:54.216Z


## [1.6.5] - 2025-11-08

### Beta
- Version 1.6.5 release

### Technical Details
- Version: 1.6.5
- Release Type: beta
- Build Number: 202511081641
- Release Date: 2025-11-08T16:41:38.147Z


## [1.6.4] - 2025-11-08

### Beta
- Version 1.6.4 release

### Technical Details
- Version: 1.6.4
- Release Type: beta
- Build Number: 202511080702
- Release Date: 2025-11-08T07:02:12.540Z


## [1.6.3] - 2025-11-07

### Beta
- Version 1.6.3 release

### Technical Details
- Version: 1.6.3
- Release Type: beta
- Build Number: 202511072207
- Release Date: 2025-11-07T22:07:16.807Z


## [1.6.2] - 2025-11-07

### Beta
- Version 1.6.2 release

### Technical Details
- Version: 1.6.2
- Release Type: beta
- Build Number: 202511072038
- Release Date: 2025-11-07T20:38:06.545Z


## [1.6.1] - 2025-11-07

### Beta
- Version 1.6.1 release

### Technical Details
- Version: 1.6.1
- Release Type: beta
- Build Number: 202511072036
- Release Date: 2025-11-07T20:36:38.094Z


## [1.6.0] - 2025-11-07

### Beta
- Version 1.6.0 release

### Technical Details
- Version: 1.6.0
- Release Type: beta
- Build Number: 202511070811
- Release Date: 2025-11-07T08:11:06.315Z


## [1.5.16] - 2025-11-07

### Beta
- Added email provider detection with clickable links in toasts, fixed pass creation for deleted users, improved delete account flow with OTP verification, fixed cancel meeting request function, and updated meeting request labels in speaker view

### Technical Details
- Version: 1.5.16
- Release Type: beta
- Build Number: 202511070644
- Release Date: 2025-11-07T06:44:23.421Z


## [1.5.15] - 2025-11-07

### Beta
- Fixed blocked users loading issue, improved dark mode contrast, added mute functionality, and fixed duplicate navigation bar

### Technical Details
- Version: 1.5.15
- Release Type: beta
- Build Number: 202511070329
- Release Date: 2025-11-07T03:29:04.951Z


## [1.5.14] - 2025-11-07

### Beta
- Removed tutorial buttons from explore and networking screens, tutorials now auto-start automatically

### Technical Details
- Version: 1.5.14
- Release Type: beta
- Build Number: 202511070301
- Release Date: 2025-11-07T03:01:41.537Z


## [1.5.13] - 2025-11-07

### Beta
- Improved toast styling to match theme colors and enhance text contrast

### Technical Details
- Version: 1.5.13
- Release Type: beta
- Build Number: 202511070248
- Release Date: 2025-11-07T02:48:28.693Z


## [1.5.12] - 2025-11-07

### Beta
- Fixed

### Technical Details
- Version: 1.5.12
- Release Type: beta
- Build Number: 202511070059
- Release Date: 2025-11-07T00:59:46.094Z


## [1.5.11] - 2025-11-06

### Beta
- Version 1.5.11 release

### Technical Details
- Version: 1.5.11
- Release Type: beta
- Build Number: 202511062244
- Release Date: 2025-11-06T22:44:45.830Z


## [1.5.9] - 2025-11-06

### Beta
- Version 1.5.9 release

### Technical Details
- Version: 1.5.9
- Release Type: beta
- Build Number: 202511062041
- Release Date: 2025-11-06T20:41:07.484Z


## [1.5.8] - 2025-11-06

### Beta
- Version 1.5.8 release

### Technical Details
- Version: 1.5.8
- Release Type: beta
- Build Number: 202511061859
- Release Date: 2025-11-06T18:59:33.008Z


## [1.5.7] - 2025-11-06

### Beta
- Version 1.5.7 release

### Technical Details
- Version: 1.5.7
- Release Type: beta
- Build Number: 202511061751
- Release Date: 2025-11-06T17:51:10.300Z


## [1.5.6] - 2025-11-05

### Beta
- Version 1.5.6 release

### Technical Details
- Version: 1.5.6
- Release Type: beta
- Build Number: 202511052256
- Release Date: 2025-11-05T22:56:37.501Z


## [1.5.5] - 2025-11-05

### Beta
- Version 1.5.5 release

### Technical Details
- Version: 1.5.5
- Release Type: beta
- Build Number: 202511052229
- Release Date: 2025-11-05T22:29:09.517Z


## [1.5.4] - 2025-11-05

### Beta
- Version 1.5.4 release

### Technical Details
- Version: 1.5.4
- Release Type: beta
- Build Number: 202511050332
- Release Date: 2025-11-05T03:32:56.954Z


## [1.5.3] - 2025-11-05

### Beta
- Version 1.5.3 release

### Technical Details
- Version: 1.5.3
- Release Type: beta
- Build Number: 202511050324
- Release Date: 2025-11-05T03:24:58.425Z


## [1.5.2] - 2025-11-05

### Beta
- Version 1.5.2 release

### Technical Details
- Version: 1.5.2
- Release Type: beta
- Build Number: 202511050316
- Release Date: 2025-11-05T03:16:33.267Z


## [1.5.1] - 2025-11-05

### Beta
- Version 1.5.1 release

### Technical Details
- Version: 1.5.1
- Release Type: beta
- Build Number: 202511050304
- Release Date: 2025-11-05T03:04:50.194Z


## [1.5.0] - 2025-11-05

### Beta
- Version 1.5.0 release

### Technical Details
- Version: 1.5.0
- Release Type: beta
- Build Number: 202511050249
- Release Date: 2025-11-05T02:49:38.778Z


## [1.4.9] - 2025-11-04

### Beta
- Version 1.4.9 release - Improved language switching experience

### Features
- Improved language switching with smooth updates without remounting
- Enhanced I18nProvider to handle locale changes reactively
- Added useLingui hook to explore component for proper translation updates

### Bugfixes
- Fixed language switching not updating explorer section immediately
- Fixed locale changes requiring page reload to see translations
- Improved translation reactivity without component remounting

### Technical Details
- Version: 1.4.9
- Release Type: beta
- Build Number: 202511041603
- Release Date: 2025-11-04T16:03:00.000Z

## [1.4.8] - 2025-11-04

### Beta
- Version 1.4.8 release

### Technical Details
- Version: 1.4.8
- Release Type: beta
- Build Number: 202511040915
- Release Date: 2025-11-04T09:15:52.952Z


## [1.4.7] - 2025-11-03

### Beta
- Version 1.4.7 release

### Technical Details
- Version: 1.4.7
- Release Type: beta
- Build Number: 202511030135
- Release Date: 2025-11-03T01:35:53.797Z


## [1.4.6] - 2025-11-02

### Beta
- Version 1.4.6 release

### Technical Details
- Version: 1.4.6
- Release Type: beta
- Build Number: 202511022340
- Release Date: 2025-11-02T23:40:07.824Z


## [1.4.4] - 2025-11-02

### Beta
- Version 1.4.4 release

### Technical Details
- Version: 1.4.4
- Release Type: beta
- Build Number: 202511020451
- Release Date: 2025-11-02T04:51:03.247Z


## [1.4.3] - 2025-11-02

### Beta
- Version 1.4.3 release

### Technical Details
- Version: 1.4.3
- Release Type: beta
- Build Number: 202511020310
- Release Date: 2025-11-02T03:10:41.892Z


## [1.4.2] - 2025-11-01

### Beta
- Version 1.4.2 release - UI improvements and bug fixes

### Features
- HashPass logo clickable with zoom animation - navigates to home page
- Mouse wheel scroll support for Quick Access section on explore page
- Snap-to-interval scrolling for Quick Access cards matching networking center behavior

### Bugfixes
- Fixed admin status check error (PGRST116) - multiple rows returned issue
- Fixed QR code authentication error - wait for auth to finish loading
- Fixed arrow button scrolling on small viewports in Quick Access section
- Fixed HashPass logo card background to not be affected by sidebar animation

### Technical Details
- Version: 1.4.2
- Release Type: beta
- Build Number: 202511012207
- Release Date: 2025-11-01T22:07:00.000Z


## [1.4.1] - 2025-11-02

### Beta
- Version 1.4.1 release

### Technical Details
- Version: 1.4.1
- Release Type: beta
- Build Number: 202511020246
- Release Date: 2025-11-02T02:46:49.394Z


## [1.4.0] - 2025-11-02

### Released
- Polished profile view with avatar update functionality, removed sign out button and version display

### Technical Details
- Version: 1.4.0
- Release Type: stable
- Build Number: 202511020054
- Release Date: 2025-11-02T00:54:07.190Z


## [1.3.9] - 2025-10-31

### Beta
- Version 1.3.9 release

### Technical Details
- Version: 1.3.9
- Release Type: beta
- Build Number: 202510310833
- Release Date: 2025-10-31T08:33:45.755Z


## [1.3.8] - 2025-10-31

### Beta
- Version 1.3.8 release

### Technical Details
- Version: 1.3.8
- Release Type: beta
- Build Number: 202510310801
- Release Date: 2025-10-31T08:01:01.844Z


## [1.3.7] - 2025-10-31

### Beta
- Version 1.3.7 release

### Technical Details
- Version: 1.3.7
- Release Type: beta
- Build Number: 202510310647
- Release Date: 2025-10-31T06:47:39.150Z


## [1.3.6] - 2025-10-31

### Beta
- Version 1.3.6 release

### Technical Details
- Version: 1.3.6
- Release Type: beta
- Build Number: 202510310635
- Release Date: 2025-10-31T06:35:14.616Z


## [1.3.5] - 2025-10-31

### Beta
- Version 1.3.5 release

### Technical Details
- Version: 1.3.5
- Release Type: beta
- Build Number: 202510310421
- Release Date: 2025-10-31T04:21:16.202Z


## [1.3.4] - 2025-10-30

### Beta
- Version 1.3.4 release

### Technical Details
- Version: 1.3.4
- Release Type: beta
- Build Number: 202510302121
- Release Date: 2025-10-30T21:21:17.896Z


## [1.3.2] - 2025-10-27

### Beta
- Updated version display and changelog automation

### Technical Details
- Version: 1.3.2
- Release Type: beta
- Build Number: 202510272149
- Release Date: 2025-10-27T21:49:11.400Z


## [1.2.9] - 2025-10-26

### Bug Fixes
- Fixed TypeScript error where 'event' was possibly null in agenda.tsx
- Updated dependency array to use optional chaining for event.agenda

### Technical Details
- Version bump to 1.2.9
- Build timestamp: 2025-10-26T18:52:00.000Z

## [1.1.7] - 2025-10-15

### Bug Fixes
- Version bump to 1.1.7
- Build: 202510150933
- Release Type: stable

### Technical Details
- Automated version update
- Build timestamp: 2025-10-15T14:33:27.375Z
All notable changes to the BSL 2025 HashPass application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-01-15

### New Features
- User pass management system with database integration
- BSL 2025 event integration with live agenda updates
- Speaker profile system with avatar support and search functionality
- Event agenda with tabbed interface and real-time countdown
- Unified search and filter system across all views
- Dark mode support with proper contrast adjustments
- Event banner component for consistent branding
- Pass card UI with BSL2025 branding and logo seal
- Real-time countdown system for event timing
- Version tracking and display system

### Bug Fixes
- Fixed SVG logo rendering issues by implementing text-based fallback
- Resolved TypeScript undefined property errors with proper null checking
- Fixed agenda data grouping logic for proper day distribution
- Corrected speaker count discrepancies and duplicate entries
- Fixed dark mode contrast issues across all components
- Resolved navigation routing problems between views
- Fixed alphabetical dividers in speaker list
- Corrected filter and search system consistency

### Technical Improvements
- Implemented comprehensive versioning system with semantic versioning
- Added version display component in sidebar
- Created automated version update scripts
- Enhanced error handling and fallback mechanisms
- Improved database integration with proper RLS policies
- Optimized UI performance and rendering

### Breaking Changes
- None in this version

### Notes
- Major UI overhaul with BSL 2025 branding and improved user experience
- All components now support both light and dark themes
- Database schema updated for better data consistency
- Version tracking system implemented for better development workflow

## [1.1.0] - 2025-01-14

### New Features
- Basic event management system
- Speaker listing functionality with search
- Simple agenda display
- Basic authentication system

### Bug Fixes
- Fixed initial setup issues
- Resolved database connection problems

### Breaking Changes
- None

### Notes
- Initial BSL 2025 integration

## [1.0.0] - 2025-01-13

### New Features
- Core HashPass application structure
- Basic navigation system with drawer
- Theme management (light/dark mode)
- Event context system
- Language support (English/Spanish)

### Bug Fixes
- None

### Breaking Changes
- None

### Notes
- Initial HashPass application release
- Foundation for BSL 2025 event integration
