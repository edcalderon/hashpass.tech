# Type and interface placement

Product code keeps reusable TypeScript declarations in dedicated type modules.
For a component, use a nearby `types/ComponentName.types.ts` module (or the
nearest existing `types.ts` module for a shared scope), then import declarations
with `import type`.

Examples:

```text
components/
  ProfileCard.tsx
  types/
    ProfileCard.types.ts

lib/networking/
  client.ts
  types.ts
```

The `check:type-placement` guard runs as part of the mobile lint command. It
checks only added lines in the current diff, so existing declarations remain a
tracked migration backlog while new local declarations are blocked. Test files,
stories, declaration files, and the `archive/` tree are intentionally excluded.

When an existing declaration is changed, move it into the appropriate types
module as part of the same change where practical. Keep runtime values and
behavior in the component or scope module; keep interfaces, type aliases, and
type-only unions in the dedicated types module.
