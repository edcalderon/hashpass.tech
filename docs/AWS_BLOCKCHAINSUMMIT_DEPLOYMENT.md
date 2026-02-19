# AWS Deployment Plan - Blockchain Summit

## Objective

Deploy the Expo web app on AWS with:

- `blockchainsummit-dev.hashpass.lat` (development)
- `blockchainsummit.hashpass.lat` (production)
- Directus auth on GCP:
  - `https://sso-dev.hashpass.co` (development)
  - `https://sso.hashpass.co` (production)
- Supabase database kept as-is

This plan prioritizes:

- low operational overhead
- low cost at low-to-medium traffic
- clear scaling path

## Recommended Architecture

### Frontend

- Host `apps/web-app` on AWS Amplify Hosting (branch-based deployments):
  - `develop` branch -> `blockchainsummit-dev.hashpass.lat`
  - `main` branch -> `blockchainsummit.hashpass.lat`

### API Routes (Expo server functions)

- Keep a single AWS Lambda router for Expo server API routes (already implemented in `lambda/index.js`)
- Put Lambda behind API Gateway HTTP API
- Use custom domains:
  - `api-dev.hashpass.tech` -> dev API stage
  - `api.hashpass.tech` -> prod API stage

### Identity/Data

- Directus on GCP remains identity provider and auth/session authority
- Supabase remains database provider

## Why This Is the Best Next Step

- Reuses your current working architecture (least migration risk)
- Keeps frontend and API independently deployable
- Avoids always-on container cost
- Keeps scale characteristics of Lambda/API Gateway
- Keeps future path open to CloudFront+S3 if you later want to leave Amplify

## Required Environment Variables

Set per Amplify branch:

- `AUTH_PROVIDER=directus`
- `EXPO_PUBLIC_DIRECTUS_URL=https://sso-dev.hashpass.co` (dev)
- `DIRECTUS_URL=https://sso-dev.hashpass.co` (dev)
- `EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co` (prod)
- `DIRECTUS_URL=https://sso.hashpass.co` (prod)
- `EXPO_PUBLIC_API_BASE_URL=https://api-dev.hashpass.tech/api` (dev)
- `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api` (prod)

## Directus (GCP) Must Be Updated for New Domains

In Directus environment:

- `AUTH_GOOGLE_REDIRECT_ALLOW_LIST` must include:
  - `https://blockchainsummit-dev.hashpass.lat/auth/callback`
  - `https://blockchainsummit.hashpass.lat/auth/callback`
- `CORS_ORIGIN` must include:
  - `https://blockchainsummit-dev.hashpass.lat`
  - `https://blockchainsummit.hashpass.lat`

These defaults were added in:

- `docker-compose.yml`
- `apps/directus/docker-compose.yml`

## Rollout Steps

1. Create/verify ACM certificates:
   - For Amplify custom domains (managed by Amplify)
   - For API Gateway custom domains (regional cert in same region as API Gateway)
2. Route53 records:
   - `blockchainsummit-dev.hashpass.lat` -> Amplify dev branch
   - `blockchainsummit.hashpass.lat` -> Amplify main branch
   - `api-dev.hashpass.tech` -> API Gateway custom domain
   - `api.hashpass.tech` -> API Gateway custom domain
3. Set Amplify environment variables per branch.
4. Deploy Lambda API router (dev/prod aliases or separate functions).
5. Configure API Gateway stages/mappings for `/api`.
6. Update Directus CORS + Google redirect allow-list.
7. End-to-end validation:
   - OAuth login
   - `GET /users/me` via browser session
   - profile screen data hydration
   - logout/login cycle

## Cost Notes (Decision Guidance)

- Amplify Hosting: good DX and low ops burden for frontend teams.
- Lambda + API Gateway HTTP API: strong cost profile for bursty traffic.
- Keep one Lambda router function to reduce cold-start and deployment surface.

For exact monthly estimates, use AWS Pricing Calculator with your expected:

- monthly requests
- response size/egress
- build minutes
- storage

## Optional Next Optimization (Later)

If you want to remove Amplify complexity entirely, migrate to IaC-managed CloudFront+S3+API Gateway+Lambda (CDK/SST/Terraform) in a second phase. Do not combine that migration with the domain cutover.
