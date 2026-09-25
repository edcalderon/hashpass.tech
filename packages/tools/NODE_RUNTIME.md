# Node runtime baseline

Use **Node 24.21.0** and the `packageManager` version in the root package.json
(currently pnpm 9.15.5). `.nvmrc` is the source of truth for development and CI.

```sh
nvm install
nvm use
corepack enable pnpm
corepack prepare pnpm@9.15.5 --activate
pnpm check:node
pnpm install --frozen-lockfile
```

Run `nvm alias default 24.21.0` to make this the current OS user's default outside
the repository. Existing terminals/services do not switch runtime automatically.
Keep older NVM versions available for rollback. Do not replace OS-managed Node or
vendor-managed container runtimes as part of a project install.

The root preinstall hook checks the running patch and consistency between local
version files, root engines, GitHub Actions, EAS profiles, CodeBuild configuration
and EC2 bootstrap templates. CI reads `.nvmrc`; EAS and bootstrap templates carry
explicit copies checked by that hook. CodeBuild selects Node 24 then installs the
exact `.nvmrc` version using its `n` runtime manager.

Lambda IaC selects `nodejs24.x`. Its package engine is `24.x` because AWS manages
runtime patch updates. Updating IaC does not change an already deployed function
or runner; apply it through the normal release process. SDK/CLI consumer engines
remain `>=20`: that is their supported consumer range, not this repository's
build baseline. Directus's container runtime remains owned by its vendor image.

After switching Node versions, Metro may reject an older V8 cache and perform a
full crawl. Allow startup to finish; if needed restart Expo with `--clear`.
Do not clear wallet storage, application data, or the package lockfile.

For the next patch upgrade, update `.nvmrc`, `.node-version`, root engines, EAS
profiles and the two EC2 bootstrap templates together. Run `pnpm check:node`, a
frozen install and the affected build/test suites. The application version and
changelog are handled separately by the existing release scripts.

24.14.1 was rejected as the baseline because it predates subsequent Node 24
security fixes:
https://nodejs.org/en/blog/vulnerability/july-2026-security-releases

Release used:
https://nodejs.org/en/blog/release/v24.21.0
