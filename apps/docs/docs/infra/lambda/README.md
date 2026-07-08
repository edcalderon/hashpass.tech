# Lambda

Current Lambda deployment notes for the HASHPASS API routes live here.

The active deploy path is the target-account web pipeline. It updates:

- production: `hashpass-prod-expo-router-api`
- development: `hashpass-dev-expo-router-api`

The deploy must verify `/api/config/versions` before it is considered complete.

## Active Docs

- [`LAMBDA-CI-CD-QUICK-START.md`](LAMBDA-CI-CD-QUICK-START.md) - current release and emergency deploy path
- [`LAMBDA-CI-CD-SETUP.md`](LAMBDA-CI-CD-SETUP.md) - target web stack Lambda wiring
