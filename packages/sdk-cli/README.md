# `@hashpass-tech/sdk-cli`

The official Hashpass command-line adapter. It uses OAuth-style device authorization so terminals never collect passwords and exposes the same support ticket lifecycle as `@hashpass-tech/sdk`.

```sh
npm install --global @hashpass-tech/sdk-cli
export HASHPASS_APP_ID=your-public-app-id
hashpass login
hashpass support create --subject "Build failure" --message "Deployment 42 failed"
hashpass support list --status open --json
hashpass support handoff ticket_123
```

Sessions are written atomically to `${XDG_CONFIG_HOME:-~/.config}/hashpass/session.json` with user-only permissions. `HASHPASS_SESSION_FILE` can redirect the file; teams requiring OS-keychain custody can import `runCli` and inject their own application integration in a future adapter.
