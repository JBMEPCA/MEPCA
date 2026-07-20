// The house solus e-shot shell and its helpers. No secrets here — this file
// is imported by both the API routes and the Builder UI (the browser needs the
// same markup to render a faithful preview and to swap [[IMAGE_n]] markers).
//
// Built as a classic 600px single-column email: table-free modern markup with
// a <style> block (fine in today's clients) plus bulletproof inline sizing on
// images. When JB supplies a real client HTML e-shot, that goes through
// untouched — this shell is only for "build from files" mode.

// Email-safe <img> used when an [[IMAGE_n]] marker is resolved.
export function eshotImageTag(url: string, alt = ""): string {
  return `<img src="${url}" alt="${alt}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto;" />`;
}

export function replaceImageMarkers(html: string, urls: string[]): string {
  let out = html;
  urls.forEach((url, i) => {
    out = out.replaceAll(`[[IMAGE_${i + 1}]]`, eshotImageTag(url));
  });
  // Any marker without a matching image simply disappears from the send.
  return out.replace(/<p>\s*\[\[IMAGE_\d+\]\]\s*<\/p>/g, "").replace(/\[\[IMAGE_\d+\]\]/g, "");
}

// The compliance footer Mailchimp requires on real sends. Merge tags resolve
// inside Mailchimp: *|UNSUB|* is the one-click unsubscribe URL and
// *|LIST:ADDRESSLINE|* the account's postal address.
export function complianceFooter(audienceName?: string): string {
  return `
  <div style="max-width:600px;margin:0 auto;padding:20px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#888888;">
    <p style="margin:0 0 6px;">You are receiving this email as a subscriber${audienceName ? ` to ${audienceName}` : ""}.</p>
    <p style="margin:0 0 6px;"><a href="*|UNSUB|*" style="color:#888888;text-decoration:underline;">Unsubscribe</a> &nbsp;·&nbsp; <a href="*|UPDATE_PROFILE|*" style="color:#888888;text-decoration:underline;">Update preferences</a></p>
    <p style="margin:0;">*|LIST:ADDRESSLINE|*</p>
  </div>`;
}

// Guard for pasted/dropped client HTML: if it carries no unsubscribe link,
// Mailchimp will refuse the real send later — append the footer so the draft
// never gets stuck at that hurdle.
export function ensureUnsubscribeFooter(html: string, audienceName?: string): string {
  const hasUnsub = html.includes("*|UNSUB|*") || /unsubscribe/i.test(html);
  if (hasUnsub) return html;
  const footer = complianceFooter(audienceName);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${footer}</body>`);
  return html + footer;
}

// Full document for "build from files" mode. bodyHtml may contain [[IMAGE_n]]
// markers and a CTA anchor with class="cta-button".
export function renderEshotHtml(opts: {
  subject: string;
  bodyHtml: string;
  audienceName?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.subject.replace(/</g, "&lt;")}</title>
<style>
  body { margin:0; padding:0; background:#f2f2f2; }
  .wrap { max-width:600px; margin:0 auto; background:#ffffff; }
  .body-copy { padding:28px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.65; color:#333333; }
  .body-copy h2 { font-size:20px; line-height:1.3; margin:24px 0 12px; color:#111111; }
  .body-copy p { margin:0 0 16px; }
  .body-copy ul { margin:0 0 16px; padding-left:22px; }
  .body-copy a { color:#1a6fb5; }
  .body-copy img { margin:8px 0; }
  a.cta-button { display:inline-block; background:#1a6fb5; color:#ffffff !important; text-decoration:none; font-weight:bold; padding:13px 30px; border-radius:4px; margin:8px 0 4px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="body-copy">
${opts.bodyHtml}
    </div>
  </div>
${complianceFooter(opts.audienceName)}
</body>
</html>`;
}
