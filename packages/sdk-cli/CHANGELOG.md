# Changelog

All notable changes to `@hashpass/sdk-cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
`@hashpass/sdk-cli` and `@hashpass/sdk` intentionally share one version
number (see `../sdk/ARCHITECTURE.md`'s "Release contract") and are tagged
together as `sdk-cli-v<version>`, but each package keeps its own changelog
describing only what changed in that package.

## [Unreleased]

## [0.1.0] - 2026-08-18

### Added

- Initial release. `hashpass` CLI with device-code `login`, `logout`, and
  `whoami`, plus `support create|list|show|reply|handoff|resolve` for
  AI-assisted support tickets.
- `FileSessionStore`: file-based session persistence with atomic writes and
  `0600` permissions, so terminal sessions never touch a password or hold
  tokens in plain shell history.

Not yet published to npm as of this entry. Compare links will be added here
once the `sdk-cli-v0.1.0` tag exists.
