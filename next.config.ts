import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "adm-zip", "heic-convert"],
  experimental: {
    middlewareClientMaxBodySize: "100mb",
  },
};

export default nextConfig;

