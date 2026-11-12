import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // Static export
  images: { unoptimized: true },
};

export default nextConfig;
