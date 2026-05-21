import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Allow LAN access during dev (phone hitting the dev box on the local
  // network). Without this, Next 16 blocks cross-origin requests to
  // /_next/* and HMR. Covers typical home-router IPv4 ranges and .local
  // mDNS hostnames.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
};

export default nextConfig;
