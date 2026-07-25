import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      /*
        `server-only` throws on import outside a React Server Component, which is
        exactly what it's for — it turns "someone imported the service-role
        Supabase client into the browser bundle" into a build error rather than a
        leaked key. Vitest is neither, so point it at the package's own no-op
        build. Note this is the file, not the `server-only/empty` specifier: the
        package's exports map doesn't expose that subpath.
      */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["test/**/*.test.js"],
  },
});
