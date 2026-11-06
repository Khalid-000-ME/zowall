import type { NextConfig } from "next";

/**
 * Env note: Next only reads .env files from this directory, so the root
 * .env.local reaches it through a symlink that `scripts/link-env.mjs` creates
 * on postinstall. Loading the root env here instead does not work - Turbopack's
 * dev workers re-read env per process and never see it.
 */
const config: NextConfig = {
  // The workspace packages ship raw TypeScript on purpose: gate-core is meant
  // to be read, not consumed as a build artifact. Next compiles them in place.
  transpilePackages: [
    "@zowall/gate-core",
    "@zowall/journal",
    "@zowall/sdk",
    "@zowall/world",
    "@zowall/agent",
    "@zowall/x402",
  ],
  typedRoutes: true,
  // Loaded from node_modules at runtime rather than bundled: the Hedera SDK is
  // large and carries native-style dependencies that bundlers handle badly.
  serverExternalPackages: ["@hashgraph/sdk"],
};

export default config;
