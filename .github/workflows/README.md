# GitHub Actions Workflows

## Playground deployment

`.github/workflows/deploy.yml` deploys the Vite playground to Cloudflare Pages:

- Production: every push to `main`
- Preview: every pull request targeting `main`
- Pages project: `automata-playground`
- Build output: `packages/playground/dist`
- Node version: 22

The build uses `VITE_PUBLIC_BASE=/automata/` so the app can be served from `https://caza.la/automata` through the Worker proxy.

## Worker deployment

`.github/workflows/worker.yml` deploys `packages/worker` on pushes to `main` when Worker-related files change.

- Worker name: `cazala-automata-worker`
- Route: `caza.la/automata*`
- Upstream: `https://automata.caza.la`
- Node version: 22

## Required GitHub secrets

Add these repository secrets under GitHub Settings -> Secrets and variables -> Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The token needs access to edit Cloudflare Pages and Workers for the target account/zone.
