import { LinkedInGenerator } from "@/components/linkedin/linkedin-generator";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";
import { NotSetUpYet } from "@/components/not-set-up-yet";

export const metadata = { title: "LinkedIn Generator — Cogent Hub" };

export default async function LinkedInPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();

  // The generator reads the magazine's WordPress site for context; only MEPCA
  // is connected so far.
  if (mag.slug !== "mepca") {
    return (
      <NotSetUpYet
        title={`${mag.shortName} LinkedIn Generator`}
        what={`${mag.name}'s articles to turn them into ready-made LinkedIn posts`}
        need={`${mag.name}'s house style and article sources`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LinkedIn Generator</h1>
        <p className="text-sm text-muted-foreground">
          Drop an article or a whole issue PDF and get a ready-made LinkedIn post to paste. Nothing
          is posted automatically — you review, tweak and publish it yourself.
        </p>
      </div>
      <LinkedInGenerator />
    </div>
  );
}
