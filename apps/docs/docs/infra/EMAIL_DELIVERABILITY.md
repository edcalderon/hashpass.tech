# Email Deliverability

## Providers by sender

Hostinger is the main email provider for `@hashpass.tech`. **Only
`no-reply@hashpass.tech` goes through Brevo**; every other `@hashpass.tech`
mailbox sends and receives through Hostinger.

| Sender | Provider | Used for | Env prefix |
|--------|----------|----------|------------|
| `no-reply@hashpass.tech` | Brevo relay | Transactional/OTP/app mail | `NODEMAILER_*` |
| `updates@hashpass.tech` | Hostinger (`smtp.hostinger.com:465`, implicit TLS; IMAP `imap.hostinger.com:993`) | Newsletter, subscription confirmation, admin campaign/update messages | `NODEMAILER_*_UPDATES` |
| `no-reply@hashpass.info` | `NODEMAILER_*_INFO` relay | Welcome email | `NODEMAILER_*_INFO` |

The updates mailbox is sent directly from Hostinger so bulk-style mail does not
pass through Brevo's relay and its spam detection. In `apps/mobile-app/lib/email.ts`,
`sendSubscriptionConfirmation` and `sendAdminCampaignEmail` use the
`_UPDATES` sender and fall back to the primary sender if it is not configured.
Use IMAP, never POP3. Port 465 uses `secure: true`; 587 uses STARTTLS.

Locally the `_UPDATES` variables live in `.env`. On deployed Lambdas they are
not raw env vars (4KB limit) and are fetched from Infisical at runtime. Add
`NODEMAILER_HOST_UPDATES`, `NODEMAILER_PORT_UPDATES`, `NODEMAILER_USER_UPDATES`,
`NODEMAILER_PASS_UPDATES` and `NODEMAILER_FROM_UPDATES` there.

The rest of this runbook covers the Brevo-sent `no-reply@hashpass.tech` mail.
Do not put SMTP/API keys, recipient addresses, or raw headers in this document.

## Sender setup

- Keep the Brevo sender and its sending domain verified.
- Prefer a dedicated sending subdomain for bulk or newsletter mail (for
  example, `updates.hashpass.tech`) while keeping a monitored support address
  as `Reply-To`.
- Keep marketing mail and authentication/security mail in separate Brevo
  sender pools. Never send product mail from an OTP or password-reset sender.
- Use only consented recipients. Honor Brevo suppressions, bounces, spam
  complaints, and unsubscribe requests; do not re-import suppressed contacts.

## Authentication and alignment

Each received message must show `pass` for SPF, DKIM, and DMARC, with the
authenticated domain aligned with the visible From domain. Check public DNS
and Brevo's domain-verification screen after every sender-domain change.

- There must be exactly one SPF TXT record per sending domain or subdomain;
  merge authorized providers into that record rather than creating another.
- There must be exactly one DMARC record at `_dmarc.hashpass.tech`. Start new
  policies with reporting enabled, inspect aggregate reports, then move from
  `p=none` to `p=quarantine` and finally `p=reject` only after all legitimate
  senders are aligned.
- Keep Brevo DKIM active. Configure Brevo's branded return-path and tracking
  domains on the same sending-domain family so links do not use a shared
  provider domain.

## Sending hygiene

Subscription confirmations must state why the recipient is receiving the
message, include a useful plain-text alternative, expose a working support
reply path, and contain a valid unsubscribe mechanism when the message is
marketing-related. Avoid sudden high-volume sends: begin with recently active,
consenting contacts and increase volume gradually. A dedicated IP is useful
only at sustained volume and must be warmed before broad sends.

## Triage when a message is spammed

1. Obtain the original message source from the recipient; do not forward raw
   headers into public issues.
2. Record the receiving provider, timestamp, visible From address, return-path,
   and SPF/DKIM/DMARC result and aligned domains.
3. Check Brevo transactional logs and events for delivery, bounce, blocklist,
   complaint, and spam-report signals. Compare a small send to another mailbox
   provider: Thunderbird is a client, while the mailbox provider's filter makes
   the placement decision.
4. If authentication passes, inspect sender/domain reputation, complaint rate,
   volume changes, consent source, and content/link domains before changing
   templates. Authentication passing is necessary but does not guarantee inbox
   placement.
5. For systemic placement failures, pause broad sends and open a Brevo support
   case with the message identifiers and private headers. Do not weaken TLS,
   remove unsubscribe handling, or rotate sender domains to evade filtering.

## Verification after a change

Send a controlled test to separate Gmail, Microsoft, and hosted-mailbox
accounts. Confirm aligned authentication in each original header, the intended
reply-to and unsubscribe behavior, and Brevo event logs. Monitor placement and
complaints for several normal send cycles before strengthening DMARC enforcement
or increasing volume.
