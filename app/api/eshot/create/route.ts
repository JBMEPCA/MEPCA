import {
  ALWAYS_TEST_RECIPIENT,
  createDraftCampaign,
  findOrCreateTemplate,
  hasMailchimpCreds,
  sendTestEmail,
  setCampaignContent,
  setCampaignContentFromTemplate,
} from "@/lib/mailchimp";
import {
  ensureUnsubscribeFooter,
  fillTemplateShell,
  hubTemplateShell,
  HUB_TEMPLATE_NAME,
} from "@/lib/eshot-template";

// The final step: create the campaign in Mailchimp as a DRAFT (never sent
// from here), load the content in, and fire the test emails — always to
// digital@cimltd.co.uk, plus an optional second address.
//
// Hub-built e-shots ("files" mode) are set from the shared template with
// hero/body sections, so they open EDITABLE in Mailchimp's campaign editor.
// Client-supplied HTML goes in as raw code — it arrives as code and stays so.
export const maxDuration = 120;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    listId?: string;
    audienceName?: string;
    excludeSegmentIds?: number[];
    subject?: string;
    previewText?: string;
    fromName?: string;
    replyTo?: string;
    sendDate?: string;
    html?: string;
    sections?: { hero?: string; body?: string };
    extraTestEmail?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }

  const listId = (body.listId ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const fromName = (body.fromName ?? "").trim();
  const replyTo = (body.replyTo ?? "").trim();
  const html = (body.html ?? "").trim();
  const sendDate = (body.sendDate ?? "").trim();
  const extraTestEmail = (body.extraTestEmail ?? "").trim();
  const excludeSegmentIds = (body.excludeSegmentIds ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!listId) return Response.json({ error: "Choose an audience first." }, { status: 400 });
  if (!subject) return Response.json({ error: "The subject line is empty." }, { status: 400 });
  if (!fromName) return Response.json({ error: "The sender name is empty." }, { status: 400 });
  if (!EMAIL_RE.test(replyTo)) {
    return Response.json({ error: "The reply-to email doesn't look valid." }, { status: 400 });
  }
  if (extraTestEmail && !EMAIL_RE.test(extraTestEmail)) {
    return Response.json({ error: "The second test email doesn't look valid." }, { status: 400 });
  }
  const sections =
    body.sections && typeof body.sections.body === "string"
      ? { hero: body.sections.hero ?? "", body: body.sections.body }
      : null;
  if (!sections && html.length < 100) {
    return Response.json({ error: "The e-shot content is missing." }, { status: 400 });
  }

  // A draft holds no send date in Mailchimp, so the intended date is baked
  // into the internal campaign name where whoever schedules it will see it.
  const title =
    `[Solus] ${fromName} — ${subject}` + (sendDate ? ` — send ${sendDate}` : " — send date TBC");

  try {
    const campaign = await createDraftCampaign({
      listId,
      subject,
      previewText: (body.previewText ?? "").trim().slice(0, 150),
      title,
      fromName,
      replyTo,
      excludeStaticSegmentIds: excludeSegmentIds,
    });

    if (sections) {
      // Editable path: shared template + hero/body sections. If anything in
      // the template flow hiccups, fall back to raw HTML from the same shell
      // so the draft is never lost — it's just not region-editable.
      try {
        const templateId = await findOrCreateTemplate(HUB_TEMPLATE_NAME, hubTemplateShell());
        await setCampaignContentFromTemplate(campaign.id, templateId, sections);
      } catch {
        await setCampaignContent(campaign.id, fillTemplateShell(sections));
      }
    } else {
      await setCampaignContent(
        campaign.id,
        ensureUnsubscribeFooter(html, body.audienceName?.trim() || undefined)
      );
    }

    // Always digital@; dedupe in case someone types the same address again.
    const testEmails = [ALWAYS_TEST_RECIPIENT];
    if (extraTestEmail && extraTestEmail.toLowerCase() !== ALWAYS_TEST_RECIPIENT) {
      testEmails.push(extraTestEmail);
    }
    let testError: string | null = null;
    try {
      await sendTestEmail(campaign.id, testEmails);
    } catch (e) {
      // The draft exists even if the test bounced off a Mailchimp limit —
      // report it rather than failing the whole run.
      testError = e instanceof Error ? e.message : "Test email failed to send.";
    }

    return Response.json({
      editUrl: campaign.editUrl,
      testedTo: testError ? [] : testEmails,
      testError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't create the Mailchimp draft.";
    return Response.json({ error: message }, { status: 500 });
  }
}
