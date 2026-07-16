import { Card, CardContent } from "@/components/ui/card";

// Friendly placeholder for a magazine tab whose integration hasn't been
// connected yet — tells JB exactly what's missing instead of erroring.
export function NotSetUpYet({
  title,
  what,
  need,
}: {
  title: string;
  what: string; // what this tab will do once connected
  need: string; // what JB needs to provide
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <p className="text-lg font-medium">Not set up yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            This tab will connect to {what}. To switch it on, we need {need} —
            same quick steps as MEPCA.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
