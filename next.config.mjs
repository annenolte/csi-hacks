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
};

export default nextConfig;
