import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build to a side directory when asked. `next build` writes into .next
  // UNDER the running server, so an in-place build returned 500s for the
  // whole build on findata - a tax authority portal, in working hours.
  // With this the deploy builds to .next-build, verifies it, and swaps it in
  // atomically; the live site never serves a half-written directory. Same
  // arrangement salvagePro and BizPhere already use.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
