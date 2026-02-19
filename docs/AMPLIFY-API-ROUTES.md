# Amplify API Routes Strategy (Expo Router)

Last reviewed: 2026-02-19

## Current AWS reality

1. Amplify Hosting has first-class API route and SSR support for Next.js apps.
2. Amplify Hosting can run other SSR frameworks through custom adapters and the `.amplify-hosting` deployment specification.
3. Amplify Gen 2 backend can define REST/GraphQL APIs backed by API Gateway + Lambda.

## What this means for this repo

1. This project uses Expo Router API routes (`apps/web-app/app/api/*+api.ts`).
2. Build output contains Expo server route bundles under `dist/server/_expo/functions/api`.
3. There is no production-ready, first-party Expo-to-Amplify-Hosting adapter in this repo.
4. The maintained production runtime is:
   - Frontend: Amplify Hosting (`hashpass.tech`, `bsl2025.hashpass.tech`)
   - API: API Gateway + Lambda (`api.hashpass.tech`)

## Should we run both Amplify-hosted API routes and Lambda?

Yes, but only with strict route separation. Do not run the same `/api/*` endpoints in two runtimes.

Recommended split if you need both:

1. Keep existing Expo API routes on `https://api.hashpass.tech/api/*` (API Gateway + Lambda).
2. If you add Amplify Gen 2 APIs, publish them on a different base path or domain (for example `/gen2/*` or `api2.hashpass.tech`).
3. Keep client config explicit per API family to avoid accidental cross-routing.

## Recommended maintenance decision

For this codebase, keep a single runtime for existing Expo API routes: API Gateway + Lambda.

Reasons:

1. Lowest operational risk (no duplicate auth/CORS/rate-limit configs).
2. Existing CI/CD already packages and deploys `hashpass-api-handler`.
3. Clear ownership and easier debugging (one CloudWatch/API Gateway path).

## Migration trigger for revisiting this decision

Re-evaluate only if one of these is true:

1. Expo ships a stable, supported Amplify Hosting adapter for API routes.
2. You decide to rewrite APIs away from Expo Router route files to Gen 2 function handlers.
3. You need tighter frontend/API co-location and are ready for a staged migration.
