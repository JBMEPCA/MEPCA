import { EshotBuilder } from "@/components/eshot/eshot-builder";
import { hasMailchimpCreds } from "@/lib/mailchimp";
import { NotSetUpYet } from "@/components/not-set-up-yet";

export const metadata = { title: "E-shot Builder — Cogent Hub" };

// Cogent-level tool (not per magazine): one Mailchimp account holds every
// audience, and the audience is picked inside the Builder itself.
export default function EshotPage() {
  if (!hasMailchimpCreds()) {
    return (
      <NotSetUpYet
        title="E-shot Builder"
        what="Mailchimp to build solus e-shots as drafts with test sends"
        need="the Mailchimp API key"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">E-shot Builder</h1>
        <p className="text-sm text-muted-foreground">
          Drop a client&apos;s finished HTML — or their copy and images — and get a solus e-shot
          drafted in Mailchimp: subject, preview text, sender, audience and exclusions all set. It
          stops at a draft and always sends a test to digital@cimltd.co.uk first.
        </p>
      </div>
      <EshotBuilder />
    </div>
  );
}
