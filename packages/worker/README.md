# `worker` (Cloudflare Worker)

This package deploys a route-scoped Cloudflare Worker that serves the Automata playground at:

- `https://caza.la/automata`

It does this by reverse-proxying to the upstream origin:

- `https://automata.caza.la`

The browser URL stays on `caza.la/automata...` without redirecting users to `*.pages.dev`, `automata.caza.la`, or the upstream domain.

## Configuration

Configured in `wrangler.jsonc`:

- Worker name: `cazala-automata-worker`
- Route: `caza.la/automata*`
- Upstream: `vars.UPSTREAM_ORIGIN` (default: `https://automata.caza.la`)
- Response header: `x-edge-proxy: cazala-automata-worker`

## Scripts

```bash
pnpm --filter worker run typecheck
pnpm --filter worker run deploy
```
