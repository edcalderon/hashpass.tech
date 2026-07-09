# Task: Email Proxy Balancer

## Goal

Replace the single-provider email setup with a transparent proxy/balancer that:

1. **Primary provider — Brevo SMTP** (`smtp-relay.brevo.com`) for all sends, up to the 300-email/day free-tier limit.
2. **Fallback provider — Self-hosted SMTP** on `hashpass.info` (Webmail at `https://webmail.tláo.com/`) when the Brevo daily budget is exhausted or Brevo returns a rate-limit error.
3. **Sender identity is always preserved**: from address remains `no-reply@hashpass.tech` regardless of which provider delivers the message.
4. **Automatic daily reset**: Brevo counter resets at midnight UTC; the balancer must reflect that.

---

## Current State

| File | Role |
|------|------|
| `apps/mobile-app/lib/email.ts` | Single nodemailer transporter; reads `NODEMAILER_HOST/PORT/USER/PASS` and sends all email through Brevo SMTP |
| `db/public.email_sent_log` | Logs sent emails per user/type; **not yet used for Brevo daily counting** |
| `apps/mobile-app/.env.example` | Defines `NODEMAILER_*` and `BREVO_API_KEY` env vars |

The Brevo free tier cap is **300 emails/day** (calendar day UTC). There is currently no enforcement of this limit or automatic failover.

---

## Architecture

```
API route (send-welcome-email, otp, etc.)
        │
        ▼
lib/email/proxy.ts          ← NEW: EmailProxy class
    │
    ├─ checkBudget()        ← reads daily counter from Supabase (email_daily_budget)
    │
    ├─ [budget OK] ──────→ BrevoTransport    (smtp-relay.brevo.com:587)
    │                            │
    │                        on success → increment counter
    │                        on 429/limit error → fallback
    │
    └─ [budget exhausted / Brevo error] ──→ FallbackTransport (hashpass.info SMTP)
                                                    │
                                                on success → log provider=fallback
```

---

## Database Changes

### New table: `email_daily_budget`

```sql
CREATE TABLE public.email_daily_budget (
  id           serial      PRIMARY KEY,
  provider     text        NOT NULL DEFAULT 'brevo',      -- 'brevo' | 'fallback'
  budget_date  date        NOT NULL DEFAULT current_date, -- UTC calendar date
  sent_count   integer     NOT NULL DEFAULT 0,
  soft_limit   integer     NOT NULL DEFAULT 280,          -- warn threshold (buffer before hard 300)
  hard_limit   integer     NOT NULL DEFAULT 300,          -- Brevo daily cap
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, budget_date)
);

-- Auto-update updated_at
CREATE TRIGGER trg_email_daily_budget_updated_at
  BEFORE UPDATE ON public.email_daily_budget
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();
```

### New function: `increment_email_budget`

```sql
CREATE OR REPLACE FUNCTION public.increment_email_budget(
  p_provider text DEFAULT 'brevo'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row email_daily_budget;
BEGIN
  INSERT INTO public.email_daily_budget (provider, budget_date, sent_count)
  VALUES (p_provider, current_date, 1)
  ON CONFLICT (provider, budget_date)
  DO UPDATE SET sent_count = email_daily_budget.sent_count + 1,
                updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'provider',    v_row.provider,
    'date',        v_row.budget_date,
    'sent_count',  v_row.sent_count,
    'soft_limit',  v_row.soft_limit,
    'hard_limit',  v_row.hard_limit,
    'exhausted',   v_row.sent_count >= v_row.hard_limit,
    'near_limit',  v_row.sent_count >= v_row.soft_limit
  );
END;
$$;

-- Read-only budget check (does not increment)
CREATE OR REPLACE FUNCTION public.get_email_budget(
  p_provider text DEFAULT 'brevo'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row email_daily_budget;
BEGIN
  SELECT * INTO v_row
  FROM public.email_daily_budget
  WHERE provider = p_provider AND budget_date = current_date;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'provider',   p_provider,
      'date',       current_date,
      'sent_count', 0,
      'soft_limit', 280,
      'hard_limit', 300,
      'exhausted',  false,
      'near_limit', false
    );
  END IF;

  RETURN jsonb_build_object(
    'provider',   v_row.provider,
    'date',       v_row.budget_date,
    'sent_count', v_row.sent_count,
    'soft_limit', v_row.soft_limit,
    'hard_limit', v_row.hard_limit,
    'exhausted',  v_row.sent_count >= v_row.hard_limit,
    'near_limit', v_row.sent_count >= v_row.soft_limit
  );
END;
$$;
```

Migration file: `db/migrations/V007__email_daily_budget.sql`

---

## New Environment Variables

Add to `.env.example` and all `.env.*` files:

```env
# Primary SMTP — Brevo
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=<brevo-login-email>
BREVO_SMTP_PASS=<brevo-smtp-key>
BREVO_DAILY_LIMIT=300
BREVO_SOFT_LIMIT=280        # switch at 280 to leave buffer

# Fallback SMTP — self-hosted hashpass.info (Webmail / tláo.com)
FALLBACK_SMTP_HOST=mail.hashpass.info
FALLBACK_SMTP_PORT=587
FALLBACK_SMTP_USER=no-reply@hashpass.info
FALLBACK_SMTP_PASS=<hashpass-info-smtp-password>

# Unified sender identity (always shown to recipient)
EMAIL_FROM_ADDRESS=no-reply@hashpass.tech
EMAIL_FROM_NAME=HashPass
```

Remove / deprecate: `NODEMAILER_HOST`, `NODEMAILER_PORT`, `NODEMAILER_USER`, `NODEMAILER_PASS`, `NODEMAILER_FROM`

---

## New Files to Create

### `apps/mobile-app/lib/email/transports.ts`
Exports two pre-configured nodemailer transports:
- `brevoTransport` — connects to Brevo SMTP
- `fallbackTransport` — connects to `mail.hashpass.info`

Both use `tls: { rejectUnauthorized: true }`.

### `apps/mobile-app/lib/email/proxy.ts`
`EmailProxy` class with a single public method:

```ts
interface SendResult {
  provider: 'brevo' | 'fallback';
  messageId: string;
  budgetAfter: { sent_count: number; exhausted: boolean; near_limit: boolean };
}

class EmailProxy {
  async send(options: nodemailer.SendMailOptions): Promise<SendResult>
}
```

Logic:
1. Call `supabase.rpc('get_email_budget', { p_provider: 'brevo' })`
2. If `exhausted` → skip to step 5
3. Try `brevoTransport.sendMail(options)`
   - On success → `increment_email_budget('brevo')` → return `{ provider: 'brevo', ... }`
   - On SMTP error with code `421`, `450`, `452`, `550` (quota/rate codes) → fall through to step 5
   - On other error → rethrow (don't silently swallow delivery errors)
4. (Brevo failed with limit error)
5. Try `fallbackTransport.sendMail(options)`
   - On success → `increment_email_budget('fallback')` → return `{ provider: 'fallback', ... }`
   - On error → rethrow

### `apps/mobile-app/lib/email/index.ts`
Re-export the proxy as the default email sender. All call sites in `lib/email.ts` that call `transporter.sendMail(...)` are migrated to call `emailProxy.send(...)` instead.

---

## Migration Plan for `lib/email.ts`

1. Replace the single `transporter` with `import { emailProxy } from './email/proxy'`
2. Replace all `transporter.sendMail(mailOptions)` calls with `emailProxy.send(mailOptions)`
3. The `info` object returned now has `{ provider, messageId, budgetAfter }` — log `provider` to help debug which path was used
4. Remove `isBrevo` flag and `NODEMAILER_*` env reads from `email.ts`
5. Keep `sendEmailVerification`, `sendWelcomeEmail`, etc. signatures identical — no API changes to callers

---

## API Route: `GET /api/admin/email-budget`

New admin-only route that returns current budget state for both providers:

```json
{
  "brevo": { "sent_count": 147, "soft_limit": 280, "hard_limit": 300, "exhausted": false, "near_limit": false },
  "fallback": { "sent_count": 12, "soft_limit": null, "hard_limit": null, "exhausted": false, "near_limit": false }
}
```

Protected by `verifyUserToken` + admin role check.

---

## SPF / DKIM / Sender Identity

Because `no-reply@hashpass.tech` is the from address but some sends may route through `hashpass.info` SMTP:

- The fallback SMTP server **must** be authorized to send `hashpass.tech` mail:
  - Add the `hashpass.info` server IP to the `hashpass.tech` SPF record:
    `include:hashpass.info` or the explicit IP `ip4:<server-ip>`
  - Set up DKIM signing on the fallback server for the `hashpass.tech` domain **or** use `Reply-To: no-reply@hashpass.tech` with a `From: no-reply@hashpass.info` (simpler, but shows `hashpass.info` to recipient)
- **Recommended approach**: Configure the self-hosted mail server to relay with DKIM for `hashpass.tech`. If that is not possible, use `From: no-reply@hashpass.info` + `Reply-To: no-reply@hashpass.tech` and update `EMAIL_FROM_ADDRESS` accordingly.

Document the DNS changes required in `apps/docs/docs/infra/EMAIL_ROUTING.md`.

---

## Acceptance Criteria

- [ ] `email_daily_budget` table exists in prod and dev with `increment_email_budget` and `get_email_budget` functions
- [ ] `EmailProxy.send()` uses Brevo until `sent_count >= BREVO_SOFT_LIMIT` (default 280), then routes to fallback
- [ ] Brevo SMTP quota errors (421, 450, 452, 550) trigger automatic fallback even if counter has not reached soft limit
- [ ] Counter resets at midnight UTC automatically (new date = new row, old rows are historical)
- [ ] All existing `lib/email.ts` send-paths use the proxy — no direct nodemailer transport calls remain
- [ ] `GET /api/admin/email-budget` returns real-time budget for both providers
- [ ] Sender identity `no-reply@hashpass.tech` is preserved on all outbound mail (SPF/DKIM or Reply-To documented)
- [ ] New env vars documented in `.env.example`; old `NODEMAILER_*` vars deprecated with a warning log if still present
- [ ] Migration V007 applied to both prod (`mnnqryrdlhddorqsrtbn`) and dev (`fxgftanraszjjyeidvia`)
- [ ] Unit tests for `EmailProxy`: budget-exhausted path, Brevo error path, happy path

---

## Files to Touch

| File | Change |
|------|--------|
| `db/migrations/V007__email_daily_budget.sql` | **NEW** — table + functions |
| `apps/mobile-app/lib/email/transports.ts` | **NEW** — Brevo + fallback transports |
| `apps/mobile-app/lib/email/proxy.ts` | **NEW** — EmailProxy class |
| `apps/mobile-app/lib/email/index.ts` | **NEW** — re-export proxy |
| `apps/mobile-app/lib/email.ts` | **MODIFY** — swap transporter → proxy |
| `apps/mobile-app/app/api/admin/email-budget+api.ts` | **NEW** — budget status route |
| `apps/mobile-app/.env.example` | **MODIFY** — add `BREVO_SMTP_*`, `FALLBACK_SMTP_*`, `EMAIL_FROM_*`; deprecate `NODEMAILER_*` |
| `apps/docs/docs/infra/EMAIL_ROUTING.md` | **NEW** — SPF/DKIM instructions, provider map |

---

## Open Questions (resolve before implementation)

1. **Fallback SMTP credentials** — what are the SMTP host/port/user/pass for the hashpass.info self-hosted server? Confirm `mail.hashpass.info:587` or alternate port.
2. **Sender identity on fallback** — can the self-hosted server sign DKIM for `hashpass.tech`? If not, use `From: no-reply@hashpass.info` + `Reply-To`.
3. **Brevo limit type** — is the 300/day limit on the free API account or on a specific sending domain? Confirm whether the counter resets at midnight UTC or at account creation time.
4. **Alert on near-limit** — should the system send an internal Slack/email alert when Brevo hits the soft limit (280)? Out of scope for MVP but worth noting.
