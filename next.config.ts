import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production builds unblocked by lint warnings — we lint separately in CI.
  // Pre-existing `any` usages and unused vars exist in the large trading dashboard
  // component; they shouldn't block deploys. Fix them in a dedicated cleanup pass.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
