import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["near-api-js", "mongodb"],
  images: {
    // Exactly the addresses cards use, so a made-up query cannot spend the optimizer's quota.
    localPatterns: [
      { pathname: "/cards/**", search: "" },
      { pathname: "/api/art/**", search: "" },
      { pathname: "/api/art/**", search: "?framed" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
