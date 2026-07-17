import type { NextConfig } from "next";

// The pre-Cogent URLs were magazine-less (the app WAS MEPCA's hub), so old
// bookmarks redirect into the MEPCA section.
const OLD_MEPCA_TABS = [
  "campaigns", "content", "pipeline", "sales", "analytics",
  "competitor-intel", "linkedin", "wordpress", "sources",
];

const nextConfig: NextConfig = {
  // pdf-parse's bundled pdf.js is plain CommonJS with dynamic requires —
  // keep it out of the server bundle and load it with native require
  serverExternalPackages: ["pdf-parse"],
  // …and make sure its files ship with the fm-sync function on Vercel,
  // since the createRequire path isn't statically traceable
  outputFileTracingIncludes: {
    "/api/fm-sync": ["./node_modules/pdf-parse/**"],
  },
  async redirects() {
    return OLD_MEPCA_TABS.map((tab) => ({
      source: `/${tab}`,
      destination: `/mepca/${tab}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
