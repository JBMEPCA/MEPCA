import { serve } from "inngest/next";

// PDF scanning can take a few minutes — allow long-running invocations
export const maxDuration = 300;
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
