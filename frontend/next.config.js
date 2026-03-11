const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  // Allow Next.js to trace files outside the frontend directory (e.g. sdk/core)
  // Required when building inside Docker where sdk lives at ../
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
