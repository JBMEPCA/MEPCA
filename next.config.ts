import type { NextConfig } from "next";

// The pre-Cogent URLs were magazine-less (the app WAS MEPCA's hub), so old
// bookmarks redirect into the MEPCA section.
const OLD_MEPCA_TABS = [
  "campaigns", "content", "pipeline", "sales", "analytics",
  "competitor-intel", "linkedin", "wordpress", "sources",
];

const nextConfig: NextConfig = {
  async redirects() {
    return OLD_MEPCA_TABS.map((tab) => ({
      source: `/${tab}`,
      destination: `/mepca/${tab}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
