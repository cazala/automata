# GitHub Actions Workflows

## Playground deployment

`.github/workflows/deploy.yml` deploys the Vite playground to Cloudflare Pages:

- Production: every push to `main`
- Preview: every pull request targeting `main`
- Pages project: `automata-playground`
- Build output: `packages/playground/dist` (playground + `/docs/`)
- Node version: 22

The build uses `VITE_PUBLIC_BASE=/automata/` so the app can be served from `https://caza.la/automata` through the Worker proxy. VitePress runs after Vite and writes the Markdown documentation to `packages/playground/dist/docs`, producing the searchable site at `https://caza.la/automata/docs/`.

## Worker deployment

`.github/workflows/worker.yml` deploys `packages/worker` on pushes to `main` when Worker-related files change.

- Worker name: `cazala-automata-worker`
- Route: `caza.la/automata*`
- Upstream: `https://automata.caza.la`
- Node version: 22

## npm publishing

`.github/workflows/publish.yml` validates the core package when a pull request
changes its source, package metadata, versioning scripts, or publishing
workflow. It builds the package, runs the versioning tests, and inspects the
tarball without publishing it.

Publishing channels:

- Every push to `main` publishes a unique prerelease to the npm `next` tag.
- A manually dispatched workflow publishes a `next` build for bootstrap or
  recovery.
- Publishing a non-prerelease GitHub release tagged `vX.Y.Z` publishes that
  exact stable version to npm's `latest` tag.
- GitHub releases marked as prereleases do not publish to npm; prerelease builds
  come from `main` through the `next` channel.

The workflow uses npm trusted publishing with GitHub OIDC. npm must be
configured for repository `cazala/automata` and workflow file `publish.yml`,
with `npm publish` permission.

### First publication

Trusted publishing can only be configured after `@cazala/automata` exists on
the npm registry. For the first publication:

1. Add a repository secret named `NPM_TOKEN` containing a granular npm token
   permitted to publish the public `@cazala/automata` package, or publish the
   package once manually.
2. Run the npm workflow manually or merge a commit to `main` to publish the
   first `next` version.
3. Configure npm trusted publishing for `cazala/automata` and `publish.yml`.
4. Delete the `NPM_TOKEN` repository secret and configure npm to require 2FA
   while disallowing token-based publishing.

## Required GitHub secrets

Add these repository secrets under GitHub Settings -> Secrets and variables -> Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare API token needs access to edit Cloudflare Pages and Workers for
the target account and zone.

`NPM_TOKEN` is temporary and only needed to bootstrap the package before npm
trusted publishing can be configured.
