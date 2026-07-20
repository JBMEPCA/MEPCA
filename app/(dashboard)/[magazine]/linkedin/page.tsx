import { LinkedInGenerator } from "@/components/linkedin/linkedin-generator";
import { SpreadImage } from "@/components/linkedin/spread-image";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";

export const metadata = { title: "LinkedIn Generator — Cogent Hub" };

export default async function LinkedInPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LinkedIn Generator</h1>
        <p className="text-sm text-muted-foreground">
          Drop a {mag.name} article or a whole issue PDF and get a ready-made LinkedIn post to
          paste. Nothing is posted automatically — you review, tweak and publish it yourself.
        </p>
      </div>
      <LinkedInGenerator magazine={mag.slug} />

      <div className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Spread image{" "}
            <span className="text-sm font-normal text-muted-foreground">(optional)</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Drop the left and right page PDFs to get a magazine-spread image for the post
            — same layout every time, on a background colour of your choice.
          </p>
        </div>
        <SpreadImage magazine={mag.slug} brandColor={mag.brandColor} />
      </div>
    </div>
  );
}
