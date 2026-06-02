import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  /**
   * Baseline browser-security headers. CSP is intentionally omitted for
   * now — Next.js inline scripts + Recharts make a tight policy painful
   * and a permissive one ("unsafe-inline") would be theatre. The headers
   * below cover the cheap, high-value bases:
   *
   *   - HSTS pins HTTPS for 1 year (no opt-out via subdomains; we don't
   *     have any). `preload` would require submitting to the
   *     hstspreload.org list — defer until the domain is stable.
   *   - frame-ancestors 'none' (via X-Frame-Options DENY) — clickjacking
   *     defense. Nothing in the app needs to be iframed.
   *   - X-Content-Type-Options nosniff — MIME-type sniff defence.
   *   - Referrer-Policy strict-origin-when-cross-origin — Next.js
   *     default-ish but explicit.
   *   - Permissions-Policy: disable APIs we don't use (camera, mic,
   *     geolocation, etc.) so a future XSS can't try to.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
