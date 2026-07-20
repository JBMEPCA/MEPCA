// Server-only Mailchimp Marketing API client. One Cogent account holds every
// audience (MEPCA, Hotel, Bar, Care Home, Total Grooming, BMA India, Salon…),
// so a single API key covers the lot — the audience is chosen per e-shot in
// the Builder, not per magazine tab.
//
// Never import this into a client component — it holds the API key.
//
// Notes learned by probing the live account:
// - The key's suffix is the data centre ("…-us4"), which forms both the API
//   host (us4.api.mailchimp.com) and the admin host for edit links.
// - Tags ARE static segments (type "static") under /lists/{id}/segments.
//   Excluding them from a send uses segment_opts conditions of
//   condition_type "StaticSegment" with op "not". Saved segments (type
//   "saved") are condition-defined and can't be excluded that way, so the
//   Builder only offers tags/static segments for exclusion — same set the
//   Mailchimp UI offers under "don't send to".
// - Campaigns created here are drafts: nothing sends until someone presses
//   Send/Schedule inside Mailchimp itself. Test emails go out via the
//   /actions/test endpoint, which works on drafts and returns 204.

// Every test send always includes this address, no matter what.
export const ALWAYS_TEST_RECIPIENT = "digital@cimltd.co.uk";

function creds(): { base: string; admin: string; auth: string } | null {
  const key = process.env.MAILCHIMP_API_KEY?.trim();
  if (!key) return null;
  const dc = key.split("-").pop();
  if (!dc) return null;
  return {
    base: `https://${dc}.api.mailchimp.com/3.0`,
    admin: `https://${dc}.admin.mailchimp.com`,
    auth: "Basic " + Buffer.from(`anystring:${key}`).toString("base64"),
  };
}

export function hasMailchimpCreds(): boolean {
  return creds() !== null;
}

async function mc<T>(path: string, init?: RequestInit): Promise<T> {
  const c = creds();
  if (!c) throw new Error("MAILCHIMP_API_KEY is not set — add it in the environment.");
  const res = await fetch(`${c.base}${path}`, {
    ...init,
    headers: {
      Authorization: c.auth,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // fall through — non-JSON error body
  }
  if (!res.ok) {
    // Mailchimp problem-detail: { title, detail, errors: [{ field, message }] }
    const d = data as { title?: string; detail?: string; errors?: { field: string; message: string }[] } | null;
    const fieldErrors = d?.errors?.map((e) => `${e.field}: ${e.message}`).join("; ");
    throw new Error(
      `Mailchimp: ${d?.detail ?? d?.title ?? `request failed (${res.status})`}${fieldErrors ? ` — ${fieldErrors}` : ""}`
    );
  }
  return data as T;
}

// ---- Audiences ----

export type Audience = {
  id: string;
  name: string;
  memberCount: number;
  // The audience's own campaign defaults — used to prefill reply-to etc.
  defaultFromName: string;
  defaultFromEmail: string;
};

export async function listAudiences(): Promise<Audience[]> {
  const data = await mc<{
    lists: {
      id: string;
      name: string;
      stats: { member_count: number };
      campaign_defaults: { from_name: string; from_email: string };
    }[];
  }>(
    "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count,lists.campaign_defaults"
  );
  return (data.lists ?? [])
    .map((l) => ({
      id: l.id,
      name: l.name,
      memberCount: l.stats?.member_count ?? 0,
      defaultFromName: l.campaign_defaults?.from_name ?? "",
      defaultFromEmail: l.campaign_defaults?.from_email ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Tags / segments ----

export type SegmentInfo = {
  id: number;
  name: string;
  type: "static" | "saved" | "fuzzy";
  memberCount: number;
};

export async function listSegments(listId: string): Promise<SegmentInfo[]> {
  const data = await mc<{
    segments: { id: number; name: string; type: SegmentInfo["type"]; member_count: number }[];
  }>(
    `/lists/${listId}/segments?count=200&fields=segments.id,segments.name,segments.type,segments.member_count`
  );
  return (data.segments ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    memberCount: s.member_count ?? 0,
  }));
}

// ---- File Manager (image hosting for e-shots) ----

export async function uploadImage(
  fileName: string,
  base64Data: string
): Promise<{ url: string }> {
  const data = await mc<{ full_size_url: string }>("/file-manager/files", {
    method: "POST",
    body: JSON.stringify({ name: fileName, file_data: base64Data }),
  });
  if (!data.full_size_url) throw new Error("Mailchimp accepted the image but returned no URL.");
  return { url: data.full_size_url };
}

// ---- Campaigns ----

export type NewDraftCampaign = {
  listId: string;
  subject: string;
  previewText: string;
  title: string; // internal campaign name shown in the Mailchimp campaign list
  fromName: string;
  replyTo: string;
  excludeStaticSegmentIds: number[];
};

export async function createDraftCampaign(input: NewDraftCampaign): Promise<{
  id: string;
  webId: number;
  editUrl: string;
}> {
  const recipients: Record<string, unknown> = { list_id: input.listId };
  if (input.excludeStaticSegmentIds.length > 0) {
    recipients.segment_opts = {
      match: "all",
      conditions: input.excludeStaticSegmentIds.map((id) => ({
        condition_type: "StaticSegment",
        field: "static_segment",
        op: "static_not",
        value: id,
      })),
    };
  }

  const data = await mc<{ id: string; web_id: number }>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      type: "regular",
      recipients,
      settings: {
        subject_line: input.subject,
        preview_text: input.previewText,
        title: input.title,
        from_name: input.fromName,
        reply_to: input.replyTo,
        // Solus e-shots arrive as finished designs with their own footer —
        // don't let Mailchimp bolt a second one on.
        auto_footer: false,
      },
    }),
  });

  const c = creds()!;
  return {
    id: data.id,
    webId: data.web_id,
    editUrl: `${c.admin}/campaigns/edit?id=${data.web_id}`,
  };
}

export async function setCampaignContent(campaignId: string, html: string): Promise<void> {
  await mc(`/campaigns/${campaignId}/content`, {
    method: "PUT",
    body: JSON.stringify({ html }),
  });
}

// ---- Templates (what makes Hub-built campaigns editable in Mailchimp) ----
// A campaign whose content is set from a template with mc:edit regions opens
// in Mailchimp's campaign editor with those regions as editable blocks —
// unlike raw-HTML campaigns, which the digital team can only edit as code.
// The API cannot create campaigns for Mailchimp's NEW drag-and-drop builder;
// template regions are as editable as the API gets.

export async function findOrCreateTemplate(name: string, html: string): Promise<number> {
  const existing = await mc<{ templates: { id: number; name: string }[] }>(
    `/templates?type=user&count=1000&fields=templates.id,templates.name`
  );
  const hit = (existing.templates ?? []).find((t) => t.name === name);
  if (hit) return hit.id;
  const created = await mc<{ id: number }>("/templates", {
    method: "POST",
    body: JSON.stringify({ name, html }),
  });
  return created.id;
}

export async function setCampaignContentFromTemplate(
  campaignId: string,
  templateId: number,
  sections: Record<string, string>
): Promise<void> {
  await mc(`/campaigns/${campaignId}/content`, {
    method: "PUT",
    body: JSON.stringify({ template: { id: templateId, sections } }),
  });
}

export async function sendTestEmail(campaignId: string, emails: string[]): Promise<void> {
  await mc(`/campaigns/${campaignId}/actions/test`, {
    method: "POST",
    body: JSON.stringify({ test_emails: emails, send_type: "html" }),
  });
}
