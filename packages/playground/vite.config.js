import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

function normalizeBase(base) {
  if (!base) return "/";
  let b = base.startsWith("/") ? base : `/${base}`;
  if (!b.endsWith("/")) b = `${b}/`;
  return b;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeBase(process.env.VITE_PUBLIC_BASE),
  resolve: {
    alias: {
      "@cazala/automata": fileURLToPath(new URL("../core/src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
  },
});
