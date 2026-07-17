// The five Cogent Multimedia titles — the single source of truth for
// everything display- and integration-related about a magazine. The DB has a
// matching Magazine row (same slug ids) purely for foreign-key integrity;
// anything that doesn't need to be queried lives here instead.
//
// Safe to import from client components: no secrets here, only env-var NAMES.
// (Whether WordPress creds exist is resolved server-side in lib/wordpress.ts.)

export type MagazineConfig = {
  slug: string; // URL segment and DB id, e.g. "care-home"
  name: string; // display name, e.g. "Care Home Magazine"
  shortName: string; // sidebar/compact label, e.g. "Care Home"
  siteUrl: string;
  brandColor: string; // hex used for the sidebar wordmark + accents
  // One-line sector description dropped into AI prompts (LinkedIn posts,
  // competitor-ad classification, WordPress drafting).
  sector: string;
  logo: string | null; // path under /public, when we have one
  // (the sidebar renders every logo white via a CSS filter, so colour/darkness
  // of the source file doesn't matter there)
  // Suffix for per-magazine env vars, e.g. WORDPRESS_APP_PASSWORD_HOTEL.
  // MEPCA also falls back to the original unsuffixed vars.
  envSuffix: string;
};

export const MAGAZINES: MagazineConfig[] = [
  {
    slug: "mepca",
    name: "MEPCA",
    shortName: "MEPCA",
    siteUrl: "https://mepca-engineering.com",
    brandColor: "#2ab6bd",
    sector: "UK manufacturing, engineering and process control trade title",
    logo: "/mepca-logo-white.png",
    envSuffix: "MEPCA",
  },
  {
    slug: "hotel",
    name: "Hotel Magazine",
    shortName: "Hotel",
    siteUrl: "https://thehotelmagazine.co.uk",
    brandColor: "#a7a9ac",
    sector: "UK hotel and hospitality industry trade title",
    logo: "/logos/hotel.png",
    envSuffix: "HOTEL",
  },
  {
    slug: "bar",
    name: "Bar Magazine",
    shortName: "Bar",
    siteUrl: "https://barmagazine.co.uk",
    brandColor: "#6fcfcb",
    sector: "UK bar, pub and nightlife trade title",
    logo: "/logos/bar.png",
    envSuffix: "BAR",
  },
  {
    slug: "care-home",
    name: "Care Home Magazine",
    shortName: "Care Home",
    siteUrl: "https://carehomemagazine.co.uk",
    brandColor: "#8583c4",
    sector: "UK care home and social care sector trade title",
    logo: "/logos/care-home.png",
    envSuffix: "CARE_HOME",
  },
  {
    slug: "grooming",
    name: "Total Grooming Magazine",
    shortName: "Grooming",
    siteUrl: "https://totalgroomingmagazine.co.uk",
    brandColor: "#b565b5",
    sector: "UK male grooming and barbering trade title",
    logo: "/logos/grooming.png",
    envSuffix: "GROOMING",
  },
];

export function getMagazine(slug: string): MagazineConfig | undefined {
  return MAGAZINES.find((m) => m.slug === slug);
}

// The tabs every magazine gets in the sidebar, in order.
export const MAGAZINE_TABS = [
  { path: "", label: "Overview" },
  { path: "/campaigns", label: "Campaigns" },
  { path: "/content", label: "Upcoming Content" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/sales", label: "Sales" },
  { path: "/analytics", label: "Analytics" },
  { path: "/competitor-intel", label: "Competitor Intel" },
  { path: "/linkedin", label: "LinkedIn Generator" },
  { path: "/wordpress", label: "WordPress Poster" },
];
