# Amplify API Routes (Legacy)

This page is preserved for historical context so the docs sidebar and older references keep resolving.
The current club deployment no longer uses AWS Amplify for routing or page delivery.

## Current Production Model

- `https://hashpass.club` serves the club web app at the site root
- `https://hashpass.club/documentation/` serves the Docusaurus site
- `club.hashpass.tech` and `docs.hashpass.tech` are DNS aliases that canonicalize to the Pages host

See [`../README.md`](../README.md) for the active deployment overview.
