export const CLUB_SITE_DOMAIN = "hashpass.club" as const;

export const CLUB_SITE_ALIASES = [
  "club.hashpass.tech",
  "docs.hashpass.tech",
] as const;

export const CLUB_SITE_ENV = {
  NEXT_PUBLIC_SITE_URL: "https://hashpass.club",
  NEXT_PUBLIC_APP_NAME: "HASHPASS Club",
  NEXT_PUBLIC_SUPPORT_EMAIL: "hello@hashpass.club",
  HASHPASS_DOCS_URL: "https://hashpass.club",
  HASHPASS_DOCS_BASE_URL: "/documentation/",
} as const;

export const CLUB_DOCS_HOST_REWRITE = `
const hostHeader = event.request.headers.host;
const host = hostHeader && hostHeader.value ? hostHeader.value.toLowerCase() : "";
if (host === "docs.hashpass.tech") {
  const uri = event.request.uri;
  if (uri === "/" || uri === "/documentation") {
    event.request.uri = "/documentation/";
  } else if (!uri.startsWith("/documentation/")) {
    event.request.uri = "/documentation" + uri;
  }
}
`;

export const CLUB_SITE_BUILD_OUTPUT = ".site-artifacts/club-docs" as const;
