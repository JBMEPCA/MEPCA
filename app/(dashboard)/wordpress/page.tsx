import { WordPressPoster } from "@/components/wordpress/wordpress-poster";

export const metadata = { title: "WordPress Poster — MEPCA Hub" };

export default function WordPressPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WordPress Poster</h1>
        <p className="text-sm text-muted-foreground">
          Drop an article and its images, and get a fully formatted WordPress draft — headings,
          internal links, feature image, Yoast SEO, category and company all filled in. It stops at
          a draft so you always do the final review and publish yourself.
        </p>
      </div>
      <WordPressPoster />
    </div>
  );
}
