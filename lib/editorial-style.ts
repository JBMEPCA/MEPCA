// Per-magazine editorial style for the WordPress Poster. Requested by the
// Cogent Hub titles (2026-07). Safe to import from client and server — pure
// config, no secrets.
//
// MEPCA and Grooming use the default (unchanged). Hotel, Bar and Care Home
// follow the PR house style agreed with editorial.

export type PullQuotePolicy = "none" | "some" | "max-two";

export type EditorialStyle = {
  // How the post title is cased.
  titleStyle: "title" | "upper";
  // Strip the trailing "About Us" / company-boilerplate section.
  removeAboutSection: boolean;
  // Keep hyperlinks that were present in the original (works from .docx, which
  // carries link data; plain text / PDF / .doc only keep visible URLs).
  preserveHyperlinks: boolean;
  // Whether (and how many) pull quotes to use.
  pullQuotes: PullQuotePolicy;
};

const DEFAULT_STYLE: EditorialStyle = {
  titleStyle: "title",
  removeAboutSection: false,
  preserveHyperlinks: false,
  pullQuotes: "none",
};

const STYLES: Record<string, EditorialStyle> = {
  hotel: {
    titleStyle: "upper",
    removeAboutSection: true,
    preserveHyperlinks: true,
    pullQuotes: "some",
  },
  bar: {
    titleStyle: "upper",
    removeAboutSection: true,
    preserveHyperlinks: true,
    pullQuotes: "max-two",
  },
  "care-home": {
    titleStyle: "title",
    removeAboutSection: true,
    preserveHyperlinks: true,
    pullQuotes: "some",
  },
};

export function editorialStyle(slug: string): EditorialStyle {
  return STYLES[slug] ?? DEFAULT_STYLE;
}
