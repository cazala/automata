const EDGE_PROXY_HEADER_VALUE = "cazala-automata-worker";
const AUTOMATA_PREFIX = "/automata";
const CANONICAL_ORIGIN = "https://caza.la";
const ALTERNATE_HOST = "automata.caza.la";

const ASSET_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".woff2",
  ".woff",
  ".ttf",
]);

function canonicalAutomataPath(pathname: string): string {
  if (pathname === AUTOMATA_PREFIX || pathname === "/") {
    return `${AUTOMATA_PREFIX}/`;
  }

  if (pathname.startsWith(`${AUTOMATA_PREFIX}/`)) {
    return pathname;
  }

  return `${AUTOMATA_PREFIX}${pathname}`;
}

function canonicalAutomataUrl(url: URL): URL {
  const canonicalUrl = new URL(
    canonicalAutomataPath(url.pathname),
    CANONICAL_ORIGIN,
  );
  canonicalUrl.search = url.search;
  return canonicalUrl;
}

function isBodyAllowed(method: string): boolean {
  // Cloudflare's fetch follows standard semantics: GET/HEAD should not include a body.
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD";
}

function looksLikeAssetPath(pathname: string): boolean {
  // The upstream Vite build typically serves hashed assets under /assets/.
  if (!pathname.startsWith("/assets/")) return false;
  return ASSET_EXTENSIONS.has(pathname.slice(pathname.lastIndexOf(".")));
}

function withEdgeHeader(headers: Headers): Headers {
  const out = new Headers(headers);
  out.set("x-edge-proxy", EDGE_PROXY_HEADER_VALUE);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === ALTERNATE_HOST) {
      return new Response(null, {
        status: 301,
        headers: withEdgeHeader(
          new Headers({
            Location: canonicalAutomataUrl(url).toString(),
          }),
        ),
      });
    }

    if (url.pathname === AUTOMATA_PREFIX) {
      return new Response(null, {
        status: 308,
        headers: withEdgeHeader(
          new Headers({
            Location: `${AUTOMATA_PREFIX}/`,
          }),
        ),
      });
    }

    if (!url.pathname.startsWith(`${AUTOMATA_PREFIX}/`)) {
      return new Response("Not Found", {
        status: 404,
        headers: withEdgeHeader(new Headers()),
      });
    }

    let upstreamPath = url.pathname.slice(AUTOMATA_PREFIX.length);
    if (upstreamPath === "") upstreamPath = "/";

    let upstreamOrigin: URL;
    try {
      upstreamOrigin = new URL(env.UPSTREAM_ORIGIN);
    } catch {
      return new Response("Upstream origin misconfigured", {
        status: 500,
        headers: withEdgeHeader(new Headers()),
      });
    }

    const upstreamUrl = new URL(upstreamOrigin.toString());
    upstreamUrl.pathname = upstreamPath;
    upstreamUrl.search = url.search;

    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.delete("host");
    upstreamHeaders.delete("accept-encoding");
    upstreamHeaders.set("x-edge-proxy", EDGE_PROXY_HEADER_VALUE);

    const init: RequestInit = {
      method: request.method,
      headers: upstreamHeaders,
      body: isBodyAllowed(request.method) ? request.body : undefined,
      redirect: "manual",
    };

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, init);
    } catch {
      return new Response("Bad Gateway", {
        status: 502,
        headers: withEdgeHeader(new Headers()),
      });
    }

    const responseHeaders = withEdgeHeader(upstreamResponse.headers);
    // The Pages origin is deliberately noindex. Only the canonical proxy is indexable.
    responseHeaders.delete("x-robots-tag");
    if (looksLikeAssetPath(upstreamPath) && !responseHeaders.has("cache-control")) {
      responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
} satisfies ExportedHandler<Env>;
