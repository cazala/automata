import { defineConfig } from "vitepress";

const DOCS_BASE = "/automata/docs/";
const DOCS_URL = `https://caza.la${DOCS_BASE}`;
const REPOSITORY_URL = "https://github.com/cazala/automata";

const guideRoutes: Record<string, string> = {
  "architecture.md": "architecture/",
  "automata.md": "automata/",
  "custom-automata.md": "custom-automata/",
  "getting-started.md": "getting-started/",
};

const pageDescriptions: Record<string, string> = {
  "index.md":
    "Documentation for Automata, a framework-agnostic TypeScript library for real-time cellular automata simulations with WebGPU and custom WGSL rules.",
  "architecture.md":
    "Understand Automata's WebGPU compute pipelines, ping-pong cell buffers, frame loop, rendering, camera, and playground architecture.",
  "automata.md":
    "Explore Automata's neural CA, Gray-Scott reaction-diffusion, Lenia, Pokemon, Life, elementary, Brian's Brain, and cyclic rules.",
  "custom-automata.md":
    "Create custom cellular automata for Automata with WGSL rules, realtime parameters, storage buffers, render hints, and custom seeding.",
  "getting-started.md":
    "Install Automata and embed a real-time WebGPU cellular automaton in any web page with TypeScript or vanilla JavaScript.",
};

const pageTitles: Record<string, string> = {
  "index.md": "Automata — WebGPU cellular automata",
  "architecture.md": "Automata Architecture",
  "automata.md": "Built-in Cellular Automata",
  "custom-automata.md": "Writing Custom Automata with WGSL",
  "getting-started.md": "Getting Started with Automata",
};

function guideHref(sourcePath: string): string | undefined {
  const sourceName = sourcePath
    .replace(/^\.\//, "")
    .replace(/^docs\//, "")
    .split("#", 1)[0];
  const route = guideRoutes[sourceName];
  return route ? `/${route}` : undefined;
}

function repositoryHref(repoPath: string): string {
  const cleanPath = repoPath.replace(/^\.\//, "").replace(/^\.\.\//, "");
  const isFile = cleanPath === "LICENSE" || /\.[^/]+$/.test(cleanPath);
  return `${REPOSITORY_URL}/${isFile ? "blob" : "tree"}/main/${cleanPath}`;
}

function rewriteHomepageHref(href: string): string {
  const cleanHref = href.replace(/^\.\//, "");
  const guide = guideHref(cleanHref);
  if (guide) return guide;

  if (
    cleanHref === "LICENSE" ||
    cleanHref === "CONTRIBUTING.md" ||
    cleanHref.startsWith("../packages/") ||
    cleanHref.startsWith("packages/")
  ) {
    return repositoryHref(cleanHref);
  }

  return href;
}

function rewriteGuideHref(href: string): string {
  const guide = guideHref(href);
  if (guide) return guide;

  if (href.startsWith("../packages/")) {
    return repositoryHref(href);
  }

  return href;
}

function canonicalUrl(relativePath: string): string {
  const route = relativePath.replace(/index\.md$/, "").replace(/\.md$/, "/");
  return new URL(route, DOCS_URL).toString();
}

export default defineConfig({
  lang: "en-US",
  title: "Automata",
  titleTemplate: ":title | Automata Documentation",
  description: pageDescriptions["index.md"],
  base: DOCS_BASE,
  outDir: "../packages/playground/dist/docs",
  srcExclude: ["README.md"],
  lastUpdated: true,

  rewrites: Object.fromEntries(
    Object.entries(guideRoutes).map(([source, route]) => [
      source,
      `${route}index.md`,
    ]),
  ),

  sitemap: {
    hostname: DOCS_URL,
  },

  head: [
    ["meta", { name: "theme-color", content: "#0d0d12" }],
    ["meta", { name: "robots", content: "index, follow" }],
  ],

  markdown: {
    config(md) {
      const defaultLinkOpen =
        md.renderer.rules.link_open ??
        ((tokens, index, options, _env, renderer) =>
          renderer.renderToken(tokens, index, options));

      md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
        const hrefIndex = tokens[index].attrIndex("href");
        if (hrefIndex >= 0) {
          const href = tokens[index].attrs![hrefIndex][1];
          const sourcePage = String(env?.relativePath ?? env?.path ?? "");
          tokens[index].attrs![hrefIndex][1] =
            sourcePage === "index.md"
              ? rewriteHomepageHref(href)
              : rewriteGuideHref(href);
        }

        return defaultLinkOpen(tokens, index, options, env, renderer);
      };
    },
  },

  transformPageData(pageData) {
    const title = pageTitles[pageData.filePath] ?? pageData.title;
    const description =
      pageDescriptions[pageData.filePath] ?? pageData.description;
    const frontmatter = { ...pageData.frontmatter };
    const head = [...(frontmatter.head ?? [])];

    if (pageData.isNotFound) {
      head.push(["meta", { name: "robots", content: "noindex" }]);
    } else {
      const canonical = canonicalUrl(pageData.relativePath);
      const socialTitle = `${title} | Automata Documentation`;

      head.push(
        ["link", { rel: "canonical", href: canonical }],
        ["meta", { property: "og:type", content: "article" }],
        ["meta", { property: "og:site_name", content: "Automata" }],
        ["meta", { property: "og:title", content: socialTitle }],
        ["meta", { property: "og:description", content: description }],
        ["meta", { property: "og:url", content: canonical }],
        ["meta", { name: "twitter:card", content: "summary" }],
        ["meta", { name: "twitter:title", content: socialTitle }],
        ["meta", { name: "twitter:description", content: description }],
      );
    }

    frontmatter.head = head;
    return { title, description, frontmatter };
  },

  themeConfig: {
    nav: [
      { text: "Documentation", link: "/" },
      {
        text: "Playground",
        link: "https://caza.la/automata/",
        target: "_self",
      },
      {
        text: "GitHub",
        link: REPOSITORY_URL,
        target: "_blank",
      },
    ],

    socialLinks: [{ icon: "github", link: REPOSITORY_URL }],

    sidebar: [
      { text: "Overview", link: "/" },
      {
        text: "Using Automata",
        items: [
          { text: "Getting Started", link: "/getting-started/" },
          { text: "Built-in Automata", link: "/automata/" },
          { text: "Writing Custom Automata", link: "/custom-automata/" },
        ],
      },
      {
        text: "Internals",
        items: [{ text: "Architecture", link: "/architecture/" }],
      },
    ],

    search: {
      provider: "local",
    },

    outline: {
      level: "deep",
      label: "On this page",
    },

    docFooter: {
      prev: "Previous guide",
      next: "Next guide",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Automata contributors",
    },
  },
});
