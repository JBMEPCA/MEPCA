// The house solus e-shot shell and its helpers. No secrets here — this file
// is imported by both the API routes and the Builder UI (the browser needs the
// same markup to render a faithful preview and to swap [[IMAGE_n]] markers).
//
// Style and compatibility choices are lifted from Cogent's own past sends
// (probed 20 Jul 2026 — e.g. the MEPCA/Endoline solus):
// - "View this email in your browser" (*|ARCHIVE|*) at the very top.
// - Lato via a Google Fonts <link> hidden from Outlook with conditional
//   comments; inline font stacks fall back to Helvetica/Arial everywhere.
// - Buttons are TABLES: border-collapse:separate + border-radius:8px +
//   background-color on the table, bold link inside — renders everywhere,
//   unlike a styled <a> alone.
// - EVERY image is wrapped in a link (the CTA or the client's homepage).
// - mso-* / -ms-interpolation-mode hygiene for Outlook's Word engine.
// Client-supplied HTML in "complete HTML" mode is never restyled.
//
// Layout: the body is split at every [[IMAGE_n]] marker, so images render as
// their own full-bleed 600px rows and copy renders in padded rows between.

const FONT = `'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const MSO = `mso-line-height-rule:exactly;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;`;
const COPY_STYLE = `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:#333333;${MSO}`;

// Email-safe <img>; linkHref wraps it in an anchor — house rule: every image
// links somewhere (main CTA or the client's homepage).
export function eshotImageTag(url: string, alt = "", linkHref = ""): string {
  const img = `<img src="${url}" alt="${alt}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`;
  if (!linkHref) return img;
  return `<a href="${linkHref}" target="_blank" style="${MSO}">${img}</a>`;
}

export function replaceImageMarkers(html: string, urls: string[], linkHref = ""): string {
  let out = html;
  urls.forEach((url, i) => {
    out = out.replaceAll(`[[IMAGE_${i + 1}]]`, eshotImageTag(url, "", linkHref));
  });
  // A marker without a matching image: drop its whole (empty) row/paragraph.
  return out
    .replace(/<tr><td style="padding:0;">\s*\[\[IMAGE_\d+\]\]\s*<\/td><\/tr>/g, "")
    .replace(/<p>\s*\[\[IMAGE_\d+\]\]\s*<\/p>/g, "")
    .replace(/\[\[IMAGE_\d+\]\]/g, "");
}

// Bulletproof CTA button, modelled on the mcnButton markup in past sends.
function buttonTable(href: string, label: string): string {
  return `<table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate !important;border-radius:8px;background-color:#1a6fb5;margin:8px auto 20px;">
  <tr><td align="center" valign="middle" style="font-family:${FONT};font-size:16px;padding:16px 36px;${MSO}">
    <a href="${href}" target="_blank" style="display:block;font-weight:bold;letter-spacing:normal;color:#ffffff;text-decoration:none;${MSO}">${label}</a>
  </td></tr></table>`;
}

// Inject inline styles onto the plain tags Claude produces. Only touches tags
// that don't already carry a style attribute, so it's safe to run twice.
export function inlineEmailStyles(bodyHtml: string): string {
  let html = bodyHtml;

  // CTA anchors become table buttons. First the tidy case — a paragraph
  // holding just the CTA (allow stray arrows/emoji around it), then a
  // fallback for a cta-button anchor sitting inside other text.
  const btn = (attrs: string, label: string) => {
    const href = attrs.match(/href="([^"]+)"/)?.[1] ?? "#";
    return buttonTable(href, label.replace(/<[^>]+>/g, "").trim());
  };
  html = html.replace(
    /<p[^>]*>[\s👉→]*<a([^>]*?)class="cta-button"([^>]*?)>([\s\S]*?)<\/a>[\s]*<\/p>/gi,
    (_m, pre, post, label) => btn(`${pre} ${post}`, label)
  );
  html = html.replace(
    /<a([^>]*?)class="cta-button"([^>]*?)>([\s\S]*?)<\/a>/gi,
    (_m, pre, post, label) => btn(`${pre} ${post}`, label)
  );

  html = html
    .replace(/<p(?![^>]*style=)/gi, `<p style="${COPY_STYLE}"`)
    .replace(/<h2(?![^>]*style=)/gi, `<h2 style="margin:24px 0 12px;font-family:${FONT};font-size:20px;font-weight:bold;line-height:1.3;color:#111111;${MSO}"`)
    .replace(/<h3(?![^>]*style=)/gi, `<h3 style="margin:20px 0 10px;font-family:${FONT};font-size:17px;font-weight:bold;line-height:1.3;color:#111111;${MSO}"`)
    .replace(/<ul(?![^>]*style=)/gi, `<ul style="margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:15px;line-height:1.65;color:#333333;"`)
    .replace(/<ol(?![^>]*style=)/gi, `<ol style="margin:0 0 16px;padding-left:22px;font-family:${FONT};font-size:15px;line-height:1.65;color:#333333;"`)
    .replace(/<li(?![^>]*style=)/gi, `<li style="margin:0 0 6px;"`)
    .replace(/<a(?![^>]*style=)/gi, `<a style="color:#1a6fb5;"`);

  return html;
}

// The compliance footer Mailchimp requires on real sends. Merge tags resolve
// inside Mailchimp: *|UNSUB|* is the one-click unsubscribe URL and
// *|LIST:ADDRESSLINE|* the account's postal address.
export function complianceFooter(audienceName?: string): string {
  const small = `font-family:${FONT};font-size:11px;line-height:1.6;color:#888888;${MSO}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 24px;">
    <p style="margin:0 0 6px;${small}">You are receiving this email as a subscriber${audienceName ? ` to ${audienceName}` : ""}.</p>
    <p style="margin:0 0 6px;${small}"><a href="*|UNSUB|*" style="color:#888888;text-decoration:underline;">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="*|UPDATE_PROFILE|*" style="color:#888888;text-decoration:underline;">Update preferences</a></p>
    <p style="margin:0;${small}">*|LIST:ADDRESSLINE|*</p>
  </td></tr></table>`;
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

// ---- The shared editable template ("build from files" mode) ----
// One template lives in the Mailchimp account (created on first use, found by
// name after that). Its two mc:edit regions — "hero" (banner image) and
// "body" (copy, mid-copy images, button) — are what the digital team can
// click and edit inside Mailchimp's campaign editor. Merge tags keep it
// campaign-agnostic: *|MC:SUBJECT|* and *|LIST:NAME|* resolve per campaign.
// Bump the version in the name whenever the shell markup changes, so stale
// copies in the account aren't reused.

export const HUB_TEMPLATE_NAME = "Cogent Hub Solus v1";

export function hubTemplateShell(): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>*|MC:SUBJECT|*</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css?family=Lato:400,400i,700,700i" rel="stylesheet" /><!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f2f2f2;${MSO}">
  <center>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2">
    <tr><td align="center" style="padding:12px;font-family:${FONT};font-size:11px;color:#656565;${MSO}">
      <a href="*|ARCHIVE|*" target="_blank" style="color:#656565;text-decoration:underline;">View this email in your browser</a>
    </td></tr>
    <tr><td align="center" style="padding:0 0 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:100%;">
        <tr><td style="padding:0;"><div mc:edit="hero"></div></td></tr>
        <tr><td style="padding:24px 32px 12px;"><div mc:edit="body"></div></td></tr>
      </table>
${complianceFooter("*|LIST:NAME|*")}
    </td></tr>
  </table>
  </center>
</body>
</html>`;
}

// Split a styled body (markers intact) into the template's two sections:
// a leading [[IMAGE_1]] becomes the full-bleed hero, everything else is body.
// imageUrls/linkHref resolve the markers (object URLs for preview, File
// Manager URLs for the real thing).
export function buildTemplateSections(
  styledBodyHtml: string,
  imageUrls: string[],
  linkHref: string
): { hero: string; body: string } {
  let body = styledBodyHtml;
  let hero = "";
  if (imageUrls.length > 0 && body.trimStart().startsWith("[[IMAGE_1]]")) {
    hero = eshotImageTag(imageUrls[0], "", linkHref);
    body = body.replace("[[IMAGE_1]]", "");
  }
  return { hero, body: replaceImageMarkers(body, imageUrls, linkHref) };
}

// A full standalone document from the sections — used for the in-app preview
// and as the raw-HTML fallback if the template flow ever fails. Substituting
// into the same shell the template uses keeps the preview honest.
export function fillTemplateShell(
  sections: { hero: string; body: string },
  display?: { subject?: string; audienceName?: string }
): string {
  let html = hubTemplateShell()
    .replace(`<div mc:edit="hero"></div>`, `<div>${sections.hero}</div>`)
    .replace(`<div mc:edit="body"></div>`, `<div>${sections.body}</div>`);
  if (display) {
    // Preview only: resolve the merge tags Mailchimp would fill in.
    html = html
      .replaceAll("*|MC:SUBJECT|*", (display.subject ?? "").replace(/</g, "&lt;"))
      .replaceAll("*|LIST:NAME|*", display.audienceName ?? "our mailing list")
      .replaceAll("*|ARCHIVE|*", "#")
      .replaceAll("*|UNSUB|*", "#")
      .replaceAll("*|UPDATE_PROFILE|*", "#")
      .replaceAll("*|LIST:ADDRESSLINE|*", "Cogent Multimedia Ltd");
  }
  return html;
}
