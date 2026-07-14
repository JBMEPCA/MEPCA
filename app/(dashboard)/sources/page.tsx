import { redirect } from "next/navigation";

// Agent HQ now lives on the Competitor Intel page
export default function SourcesPage() {
  redirect("/competitor-intel");
}
