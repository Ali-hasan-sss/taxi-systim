import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@taxi/ui", "@taxi/types"]
};

export default nextConfig;
