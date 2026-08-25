# HASHPASS Supabase magic-link templates

`unified.html` is the one complete, paste-ready template for every supported language. It uses the live HASHPASS wordmark and a table-based layout that works in major email clients.

## Paste into Supabase

In project `fxgftanraszjjyeidvia`, go to **Authentication → Email Templates → Magic link or OTP** and paste `unified.html` into **Body**. Set the subject to `Your secure HASHPASS sign-in link`, then save.

Paste the same template into **Confirm signup** as well, if that template is enabled:

1. **Magic Link or OTP**
2. **Confirm signup** — needed because the app permits a new user to be created during an OTP sign-in request.

Do not replace either occurrence of `{{ .ConfirmationURL }}`. Supabase replaces it at send time with the one-time verification URL. Replacing it with `{{ .SiteURL }}`, `{{ .RedirectTo }}`, or a hard-coded `/auth/callback` URL causes the “No auth payload in the callback URL” error.

The template chooses Spanish, Portuguese, French, German, Korean, or English from `{{ .Data.locale }}`, with English as the safe default. The app supplies that value for each magic-link request. The individual locale files remain as editable reference copies.
