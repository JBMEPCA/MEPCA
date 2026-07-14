import { db } from "@/lib/db";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { FileMakerImportButton } from "@/components/campaigns/filemaker-import-button";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, { label: string; className: string }> = {
  LIVE: { label: "Live", className: "bg-green-500/15 text-green-400 hover:bg-green-500/15" },
  UPCOMING: { label: "Upcoming", className: "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/15" },
  COMPLETED: { label: "Completed", className: "bg-white/10 text-muted-foreground hover:bg-white/10" },
};

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const liveValue = campaigns
    .filter((c) => c.status === "LIVE")
    .reduce((sum, c) => sum + Number(c.value ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {campaigns.filter((c) => c.status === "LIVE").length} live worth {gbp.format(liveValue)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FileMakerImportButton />
          <CampaignFormDialog trigger={<Button>New campaign</Button>} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Package / spec</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                No campaigns yet. Add one manually or import your FileMaker export.
              </TableCell>
            </TableRow>
          )}
          {campaigns.map((c) => {
            const status = statusStyles[c.status] ?? statusStyles.UPCOMING;
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.brand}</TableCell>
                <TableCell>{c.package}</TableCell>
                <TableCell>{c.value != null ? gbp.format(Number(c.value)) : "—"}</TableCell>
                <TableCell>{c.startDate ? format(c.startDate, "d MMM yyyy") : "—"}</TableCell>
                <TableCell>{c.endDate ? format(c.endDate, "d MMM yyyy") : "—"}</TableCell>
                <TableCell>
                  <Badge className={status.className}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <CampaignFormDialog
                    campaign={{
                      id: c.id,
                      brand: c.brand,
                      package: c.package,
                      value: c.value?.toString(),
                      startDate: c.startDate ? format(c.startDate, "yyyy-MM-dd") : undefined,
                      endDate: c.endDate ? format(c.endDate, "yyyy-MM-dd") : undefined,
                      status: c.status,
                      notes: c.notes ?? undefined,
                    }}
                    trigger={<Button variant="ghost" size="sm">Edit</Button>}
                  />
                  <DeleteCampaignButton id={c.id} brand={c.brand} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
