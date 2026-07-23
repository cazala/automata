# `worker` (Cloudflare Worker)

This package deploys a route-scoped Cloudflare Worker that serves Automata at its canonical URL:

- `https://caza.la/automata/`

It reverse-proxies canonical requests to the Cloudflare Pages origin:

- `https://automata-playground.pages.dev`

The browser URL stays on `caza.la/automata...`. Requests to the old public origin, `https://automata.caza.la/*`, receive a permanent redirect to the equivalent canonical path. Existing `/automata/...` paths are preserved, so shared playground sessions are not broken.

The Pages build sends `X-Robots-Tag: noindex` to prevent the raw origin from competing in search results. The Worker removes that header from responses served through the canonical URL.

## Configuration

Configured in `wrangler.jsonc`:

- Worker name: `cazala-automata-worker`
- Canonical route: `caza.la/automata*`
- Redirect route: `automata.caza.la/*`
- Upstream: `vars.UPSTREAM_ORIGIN` (default: `https://automata-playground.pages.dev`)
- Response header: `x-edge-proxy: cazala-automata-worker`

## Scripts

```bash
pnpm --filter worker run typecheck
pnpm --filter worker run deploy
```
