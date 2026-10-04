# Deployment

The repository is a static site and can be deployed to any static host.

## Recommended production options

### Cloudflare Pages / Vercel / Netlify

- repository: `hashpass-tech/localproof.org`
- production branch: `main`
- build command: none
- output directory: repository root
- custom domain: `localproof.org`

### GitHub Pages

GitHub Pages can also host the static site. If chosen, configure Pages from the repository settings and point the custom domain to the Pages host according to GitHub's current DNS instructions.

## Before switching DNS

1. Confirm the existing domain registrar and DNS ownership.
2. Export or screenshot current DNS records.
3. Verify SSL will be provisioned by the new host.
4. Test the generated preview URL first.
5. Only then change production DNS.
6. Keep a rollback record.

## Post-deploy checks

- `/`
- `/docs/`
- `/docs/guides.html`
- `/docs/venues.html`
- `/docs/nodes.html`
- `/docs/hardware-roadmap.html`
- `/docs/deployment.html`
- `/docs/trust-model.html`
- `/docs/terms.html`
- `/docs/privacy.html`

Check desktop/mobile layout, HTTPS, favicon, all internal links, and custom-domain redirect behavior.
