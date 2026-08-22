import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks cross-origin requests for dev-only resources (/_next/static,
  // HMR) by default. Without these entries the page server-renders but never
  // hydrates when you reach the dev server on anything other than "localhost"
  // — e.g. 127.0.0.1, a LAN IP, or a forwarded port.
  // "*.ts.net" is the tailnet: this app is meant to be reached from a phone
  // over Tailscale, which is a different origin than localhost.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "*.local",
    "*.ts.net",
    "100.64.0.0/10",
  ],

  // Keep the dev overlay badge off the dashboard.
  devIndicators: false,
};

export default nextConfig;
