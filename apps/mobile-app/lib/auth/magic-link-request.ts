import { isLocalOrigin, isSupportedFrontendOrigin } from "./oauth/frontend-origin";

const CALLBACK_PATH = "/auth/callback";

const isSafeReturnTo = (value: string | null) =>
  Boolean(value) && value!.startsWith("/") && !value!.startsWith("//");

/**
 * Reject arbitrary redirect targets before asking Supabase to mint a
 * credential-bearing link. The only supported web destination is the fixed
 * passwordless callback; native requests use that same web callback as a
 * relay and may carry a relative post-login destination.
 */
export const normalizeMagicLinkRedirect = (
  value: unknown,
): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const redirect = new URL(value.trim());
    if (
      !isSupportedFrontendOrigin(redirect.origin) ||
      (redirect.protocol !== "https:" &&
        !(redirect.protocol === "http:" && isLocalOrigin(redirect.origin))) ||
      redirect.pathname !== CALLBACK_PATH
    ) {
      return null;
    }

    const keys = [...redirect.searchParams.keys()];
    if (keys.length === 0) return redirect.toString();

    if (
      keys.some((key) => key !== "nativeRelay" && key !== "returnTo") ||
      redirect.searchParams.get("nativeRelay") !== "1" ||
      !isSafeReturnTo(redirect.searchParams.get("returnTo"))
    ) {
      return null;
    }

    return redirect.toString();
  } catch {
    return null;
  }
};
