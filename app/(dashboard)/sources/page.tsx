import { db } from "@/lib/db";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  SourceFormDialog, CheckNowButton, ActiveCheckbox, DeleteSourceButton,
  DismissAlertButton,
} from "@/components/sources/source-actions";
import { TYPE_OPTIONS } from "@/lib/source-types";
import { AgentHQ } from "@/components/agent-hq/agent-hq";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [sources, alerts] = await Promise.all([
    db.watchedSource.findMany({ orderBy: { name: "asc" } }),
    db.sourceAlert.findMany({
      where: { dismissed: false },
      include: { source: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent HQ</h1>
          <p className="text-sm text-neutral-500">
            Agent Intel patrols your competitor titles every Monday at 06:00 — or drag
            him onto one to send him now. Everything he finds lands in Competitor Intel.
          </p>
        </div>
        <SourceFormDialog trigger={<Button>Watch new source</Button>} />
      </div>

      <AgentHQ
        initialSources={sources.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          url: s.url,
          active: s.active,
          scanStatus: s.scanStatus,
          lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
          lastResult: s.lastResult,
        }))}
      />

      {alerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">Needs your attention</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {alert.message}
                    {alert.url && (
                      <>
                        {" "}
                        <a href={alert.url} target="_blank" rel="noreferrer"
                          className="text-blue-700 underline">
                          open link
                        </a>
                      </>
                    )}
                    <span className="ml-2 text-neutral-400">
                      {format(alert.createdAt, "d MMM")}
                    </span>
                  </span>
                  <DismissAlertButton id={alert.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-neutral-500">
          Manage sources ({sources.length})
        </summary>
        <div className="pt-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Watching</TableHead>
            <TableHead>Last checked</TableHead>
            <TableHead>Last result</TableHead>
            <TableHead className="text-center">Active</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-neutral-500">
                No sources yet. Add competitor websites and magazine archive pages to watch.
              </TableCell>
            </TableRow>
          )}
          {sources.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {s.name}
                </a>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {TYPE_OPTIONS.find((t) => t.value === s.type)?.label ?? s.type}
                </Badge>
              </TableCell>
              <TableCell>
                {s.lastCheckedAt ? format(s.lastCheckedAt, "d MMM HH:mm") : "Never"}
              </TableCell>
              <TableCell className="max-w-72 truncate" title={s.lastResult ?? ""}>
                {s.lastResult ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                <ActiveCheckbox id={s.id} checked={s.active} />
              </TableCell>
              <TableCell className="space-x-1 text-right">
                <CheckNowButton id={s.id} />
                <SourceFormDialog
                  source={{ id: s.id, name: s.name, type: s.type, url: s.url }}
                  trigger={<Button variant="ghost" size="sm">Edit</Button>}
                />
                <DeleteSourceButton id={s.id} name={s.name} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
        </div>
      </details>
    </div>
  );
}
