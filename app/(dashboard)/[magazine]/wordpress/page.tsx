import { WordPressPoster } from "@/components/wordpress/wordpress-poster";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";
import { NotSetUpYet } from "@/components/not-set-up-yet";

export const metadata = { title: "WordPress Poster — Cogent Hub" };

export default async function WordPressPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();

  // Posting needs the site's WordPress application password — only MEPCA's is
  // connected so far. Each title switches on as JB provides its credentials.
  if (mag.slug !== "mepca") {
    return (
      <NotSetUpYet
        title={`${mag.shortName} WordPress Poster`}
        what={`${mag.siteUrl.replace(/^https?:\/\//, "")} to create fully formatted drafts`}
        need={`a WordPress application password for ${mag.name}`}
      />
    );
  }

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
