import type { NextConfig } from "next";

// WS-0 set the initial Cache Components + Instant Navs toggles. WS-8.3c
// adds the production CSRF origin pin (review-2 DR-18). WS-8.3d adds the
// `X-Robots-Tag: noindex, nofollow` rule on `/trips/:tripId*`
// (review-3 DR-51) so the noindex hint survives CDNs that strip head
// metas. See `app/trips/[tripId]/page.tsx`'s `generateMetadata` for the
// belt-side meta tag.

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// The allowed-origins list is sourced from env at build/boot time so
// preview deploys (Vercel) and prod (Neon-backed Node container) can
// each pin their own host without code edits. We accept either a
// comma-separated `BEARCAMP_ALLOWED_ORIGINS` list OR fall back to the
// canonical production host. Empty/whitespace entries are filtered out.
function readAllowedOrigins(): string[] {
  const raw = process.env.BEARCAMP_ALLOWED_ORIGINS;
  if (raw) {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (list.length > 0) return list;
  }
  // Default — canonical deployment host. Override with
  // `BEARCAMP_ALLOWED_ORIGINS="https://app.example.com,https://preview-…"`.
  return ["https://bearcamp.app"];
}

const PROD_ALLOWED_ORIGINS = readAllowedOrigins();

const nextConfig: NextConfig = {
  // Cache Components (Next 16): static-by-default; dynamic via 'use cache'
  // / Suspense. WS-8 audits Suspense boundaries on dynamic data.
  cacheComponents: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
    // DR-18 — production CSRF origin pin. Dev intentionally leaves this
    // unset so localhost / 127.0.0.1 / LAN previews work without
    // configuration. The cache-audit test (T8.4(d)) reads this file as
    // source text and asserts the production-only branch is present.
    ...(process.env.NODE_ENV === "production"
      ? {
          serverActions: {
            allowedOrigins: PROD_ALLOWED_ORIGINS,
          },
        }
      : {}),
  },
  // DR-51 — every `/trips/<id>` response carries the noindex/nofollow
  // header at the HTTP layer in addition to the `<meta>` tag emitted by
  // `generateMetadata`. Belt-and-braces: CDNs that strip head metas
  // can't suppress the response header.
  async headers() {
    return [
      {
        source: "/trips/:tripId*",
        headers: [
          // X-Robots-Tag value: "noindex, nofollow"
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

// Silence unused-binding lint when IS_PRODUCTION isn't referenced directly
// — the production guard above is the canonical check the audit grep
// matches against.
void IS_PRODUCTION;

export default nextConfig;
