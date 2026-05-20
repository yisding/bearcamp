import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next 16): static-by-default; dynamic via 'use cache'
  // / Suspense. WS-8 audits Suspense boundaries on dynamic data.
  cacheComponents: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
};

export default nextConfig;
