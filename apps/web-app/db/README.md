# Database Migrations with Flyway

This folder contains portable database migrations that can be used with both Supabase and self-hosted PostgreSQL via Flyway.

## Folder Structure

```
db/
├── migrations/         # Versioned migrations (V001__description.sql)
├── functions/          # PostgreSQL functions (reusable)
├── seeds/              # Seed data for development
├── flyway.conf         # Flyway configuration
└── README.md           # This file
```

## Migration Naming Convention

Flyway uses a specific naming convention:
- `V{version}__{description}.sql` - Versioned migrations (e.g., `V001__init_schema.sql`)
- `R__{description}.sql` - Repeatable migrations (for views, functions)
- `U{version}__{description}.sql` - Undo migrations (optional)

## Setup

### Install Flyway

```bash
# macOS
brew install flyway

# Linux (Debian/Ubuntu)
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/10.4.1/flyway-commandline-10.4.1-linux-x64.tar.gz | tar xvz
sudo ln -s $(pwd)/flyway-10.4.1/flyway /usr/local/bin

# Docker
docker run --rm flyway/flyway -url=jdbc:postgresql://host:5432/db -user=user -password=pass migrate
```

### Configure

Copy `flyway.conf.example` to `flyway.conf` and update with your database credentials:

```bash
cp flyway.conf.example flyway.conf
```

### Run Migrations

```bash
# Run all pending migrations
flyway migrate

# Check current status
flyway info

# Validate migrations
flyway validate

# Rollback last migration (requires Flyway Teams)
flyway undo
```

## Migration from Supabase Migrations

The migrations in this folder are consolidated versions of the Supabase migrations.
They have been reorganized for portability:

1. **Provider-agnostic**: No Supabase-specific extensions (auth.uid(), etc.)
2. **Tenant isolation**: Uses `app.tenant_id` config for RLS instead of `auth.uid()`
3. **Consolidated**: Multiple migrations combined into logical groups

## Using with Different Providers

### Supabase (Development)
Use the original migrations in `supabase/migrations/` via Supabase CLI.

### Self-hosted PostgreSQL (Production)
Use Flyway with this folder:
```bash
cd db && flyway migrate
```

### Directus
Directus manages its own schema. For custom tables, use Flyway migrations
and configure Directus to read from those tables.

## Multi-tenant Support

All tables should use the tenant context pattern:

```sql
-- Set tenant context (from API layer)
SELECT set_config('app.tenant_id', 'tenant-uuid', true);

-- RLS policy using tenant context
CREATE POLICY "tenant_isolation" ON my_table
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
