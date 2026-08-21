import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks cross-origin requests for dev-only resources (/_next/static,
  // HMR) by default. Without these entries the page server-renders but never
  // hydrates when you reach the dev server on anything other than "localhost"
  // — e.g. 127.0.0.1, a LAN IP, or a forwarded port.
  allowedDevOrigins: ["localhost", "127.0.0.1", "0.0.0.0", "*.local"],

  // Keep the dev overlay badge off the dashboard.
  devIndicators: false,
};

export default nextConfig;
