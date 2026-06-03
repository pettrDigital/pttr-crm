import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google-cloud/bigquery', 'firebase-admin'],
};

export default nextConfig;
