import { redirect } from "next/navigation";

// Agent HQ now lives on the Competitor Intel page
export default async function SourcesPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  redirect(`/${magazine}/competitor-intel`);
}
