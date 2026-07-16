import { LinkedInGenerator } from "@/components/linkedin/linkedin-generator";

export const metadata = { title: "LinkedIn Generator — MEPCA Hub" };

export default function LinkedInPage() {
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
