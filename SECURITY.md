# Security Best Practices

## ⚠️ NEVER COMMIT SECRETS TO GIT

### Protected Files (Already in .gitignore)
- `.env` - All environment variables
- `.env.*` - Environment-specific configs
- `*.tfvars` - Terraform variable files
- `*.tfstate` - Terraform state files
- `wrangler.toml.local` - Cloudflare secrets

### How to Use Environment Variables

#### 1. Local Development
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
# Edit .env with your actual secrets
```

#### 2. Deployment Scripts
All deployment scripts (e.g., `tools/scripts/deploy-oauth.sh`) now automatically load from `.env`:
```bash
# Just run the script - it will load .env automatically
./tools/scripts/deploy-oauth.sh
```

#### 3. Terraform
Copy the example file and fill in your values:
```bash
cd infrastructure/terraform/gcp
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual values
```

### What to Check Before Committing

Run these commands to check for accidentally committed secrets:

```bash
# Check for hardcoded passwords
git diff | grep -i "password\|secret\|key" | grep -v "variable\|description\|TF_VAR"

# Check for specific secrets
git diff | grep -E "R%.*XwMQXp|HashPass202|GOCSPX-|576459188181"

# Check .env file is not staged
git status | grep ".env"
```

### Documentation & Markdown Files

- **Rule**: Never put real secrets (passwords, API keys, tokens, DB creds) into `.md` files or any documentation.
- **Use placeholders instead**: e.g. `DB_PASSWORD=<YOUR_DB_PASSWORD>`, `API_KEY=<YOUR_API_KEY>`.
- **Responsibility**: Every contributor must follow this rule; reviewers must reject PRs that add real secrets to docs.

### Emergency: Secret Was Committed

If you accidentally committed a secret:

1. **Immediately rotate the secret** (change password, regenerate key)
2. Remove from git history:
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/file" \
  --prune-empty --tag-name-filter cat -- --all
```
3. Force push (⚠️ coordinate with team first):
```bash
git push origin --force --all
```

### Files Audited for Security ✅

- ✅ `tools/scripts/deploy-oauth.sh` - Now loads all secrets from .env
- ✅ `scripts/apply-migration-simple.sh` - Now loads DB password from .env
- ✅ `docker-compose.yml` - Now uses .env variables
- ✅ `infrastructure/terraform/gcp/variables.tf` - Removed default values for secrets
- ✅ `.gitignore` - Updated to exclude all sensitive files

### Regular Security Checks

Add to your git pre-commit hook:
```bash
#!/bin/bash
# Check for potential secrets
if git diff --cached | grep -qE "password.*=|secret.*=|key.*=.*[a-zA-Z0-9]{20,}"; then
    echo "⚠️  Warning: Potential secret detected in commit"
    echo "Please verify you're not committing sensitive data"
    exit 1
fi
```

Save to `.git/hooks/pre-commit` and make executable:
```bash
chmod +x .git/hooks/pre-commit
```
