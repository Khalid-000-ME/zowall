import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship raw TypeScript on purpose: gate-core is meant
  // to be read, not consumed as a build artifact. Next compiles them in place.
  transpilePackages: [
    "@zowall/gate-core",
    "@zowall/journal",
    "@zowall/sdk",
    "@zowall/world",
    "@zowall/agent",
  ],
  typedRoutes: true,
};

export default config;
