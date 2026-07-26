import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/*
  Pinned because there is an unrelated package-lock.json in the parent directory,
  which otherwise makes Turbopack infer the home folder as the workspace root.
*/
const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root },
  /*
    pdf.js loads its own worker by importing a sibling file at runtime. Bundled,
    that import resolves next to the emitted chunk instead of inside node_modules
    and every PDF fails with "Setting up fake worker failed" — which reaches the
    owner as "this file couldn't be read", pointing at their document rather than
    at us. Left external, it is required from node_modules and finds its worker.

    test/documents.test.js can't catch this: Vitest resolves the package
    normally, so the PDF reader passes there whether or not this line exists.
  */
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
