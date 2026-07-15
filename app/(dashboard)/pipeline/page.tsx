import { db } from "@/lib/db";
import { format, isPast, isToday } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PipelineFormDialog } from "@/components/pipeline/pipeline-form-dialog";
import { STAGE_OPTIONS } from "@/lib/pipeline-stages";
import {
  ConvertButton, DeletePipelineButton,
} from "@/components/pipeline/pipeline-row-actions";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const stageBadge: Record<string, string> = {
  PITCHED: "bg-white/10 text-muted-foreground hover:bg-white/10",
  PROPOSAL_SENT: "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/15",
  NEGOTIATING: "bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
  VERBAL_AGREEMENT: "bg-violet-500/15 text-violet-300 hover:bg-violet-500/15",
  SIGNED_OFF: "bg-green-500/15 text-green-400 hover:bg-green-500/15",
  LOST: "bg-red-500/15 text-red-400 hover:bg-red-500/15",
};

export default async function PipelinePage() {
  const items = await db.pipelineItem.findMany({
    orderBy: [{ followUpDate: "asc" }, { updatedAt: "desc" }],
  });

  const open = items.filter((i) => i.stage !== "SIGNED_OFF" && i.stage !== "LOST");
  const closed = items.filter((i) => i.stage === "SIGNED_OFF" || i.stage === "LOST");
  const openValue = open.reduce((sum, i) => sum + Number(i.estimatedValue ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {open.length} open pitches worth {gbp.format(openValue)}
          </p>
        </div>
        <PipelineFormDialog trigger={<Button>New pitch</Button>} />
      </div>

      <PipelineTable items={open} emptyMessage="No open pitches. Add one, or pick a target from Competitor Intel." />

      {closed.length > 0 && (
        <details className="pt-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Closed ({closed.length})
          </summary>
          <div className="pt-3">
            <PipelineTable items={closed} emptyMessage="" />
          </div>
        </details>
      )}
    </div>
  );
}

type Item = Awaited<ReturnType<typeof db.pipelineItem.findMany>>[number];

function PipelineTable({ items, emptyMessage }: { items: Item[]; emptyMessage: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Brand</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Est. value</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Follow up</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
        {items.map((item) => {
          const stageLabel = STAGE_OPTIONS.find((s) => s.value === item.stage)?.label ?? item.stage;
          const overdue = item.followUpDate && (isPast(item.followUpDate) || isToday(item.followUpDate));
          const isOpen = item.stage !== "SIGNED_OFF" && item.stage !== "LOST";
          return (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.brand}</TableCell>
              <TableCell>{item.package ?? "—"}</TableCell>
              <TableCell>
                {item.estimatedValue != null ? gbp.format(Number(item.estimatedValue)) : "—"}
              </TableCell>
              <TableCell>
                <Badge className={stageBadge[item.stage]}>{stageLabel}</Badge>
              </TableCell>
              <TableCell>
                {item.followUpDate ? (
                  <span className={overdue && isOpen ? "font-semibold text-red-400" : ""}>
                    {format(item.followUpDate, "d MMM yyyy")}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="space-x-1 text-right">
                {isOpen && <ConvertButton id={item.id} brand={item.brand} />}
                <PipelineFormDialog
                  item={{
                    id: item.id,
                    brand: item.brand,
                    package: item.package ?? undefined,
                    estimatedValue: item.estimatedValue?.toString(),
                    stage: item.stage,
                    followUpDate: item.followUpDate
                      ? format(item.followUpDate, "yyyy-MM-dd")
                      : undefined,
                    notes: item.notes ?? undefined,
                  }}
                  trigger={<Button variant="ghost" size="sm">Edit</Button>}
                />
                <DeletePipelineButton id={item.id} brand={item.brand} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
