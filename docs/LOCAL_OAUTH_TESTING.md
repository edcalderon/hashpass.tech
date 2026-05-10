# Local OAuth Testing Guide

> Historical note: the current production flow is documented in [AUTH_FLOW.md](AUTH_FLOW.md). This guide documents the older local Directus testing path and is kept for reference only.

## Overview

This guide was written for the local Directus-first testing setup. The production path now goes through the API-owned Google OAuth bridge.

## Legacy Flow

1. Browser opens `/auth`.
2. Browser starts OAuth through `/api/auth/oauth/login`.
3. Older local setups redirected to Directus first.
4. Directus completed Google OAuth and returned tokens to the frontend.

## Use Today

- For production sign-in, follow [AUTH_FLOW.md](AUTH_FLOW.md).
- For legacy local testing, use the older Directus Docker stack referenced by the historical docs in this directory.
