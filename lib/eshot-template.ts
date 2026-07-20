// The house solus e-shot shell and its helpers. No secrets here — this file
// is imported by both the API routes and the Builder UI (the browser needs the
// same markup to render a faithful preview and to swap [[IMAGE_n]] markers).
//
// Email clients are hostile renderers: Outlook uses Word's engine and Gmail
// clips <style> in places, so everything that matters is a table with INLINE
// styles — the <style> block only carries the Lato @import for clients that
// honour web fonts (Apple Mail, iOS); everyone else falls back to Helvetica/
// Arial. House font is Lato per JB (20 Jul 2026). Client-supplied HTML in
// "complete HTML" mode is never restyled — their fonts stand.
//
// Layout: the body is split at every [[IMAGE_n]] marker, so images render as
// their own full-bleed 600px rows and copy renders in padded rows between
// them. That keeps Outlook happy (no width:100% images inside padded cells).

const FONT = `'Lato', Helvetica, Arial, sans-serif`;
const COPY_STYLE = `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:#333333;`;

// Email-safe <img> used when an [[IMAGE_n]] marker is resolved. Markers sit in
// full-bleed 600px cells, so a fixed width attribute is correct for Outlook
// and the max-width keeps it responsive everywhere else.
export function eshotImageTag(url: string, alt = ""): string {
  return `<img src="${url}" alt="${alt}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />`;
}

export function replaceImageMarkers(html: string, urls: string[]): string {
  let out = html;
  urls.forEach((url, i) => {
    out = out.replaceAll(`[[IMAGE_${i + 1}]]`, eshotImageTag(url));
  });
  // A marker without a matching image: drop its whole (empty) row/paragraph.
  return out
    .replace(/<tr><td style="padding:0;">\s*\[\[IMAGE_\d+\]\]\s*<\/td><\/tr>/g, "")
    .replace(/<p>\s*\[\[IMAGE_\d+\]\]\s*<\/p>/g, "")
    .replace(/\[\[IMAGE_\d+\]\]/g, "");
}

// Inject inline styles onto the plain tags Claude produces. Only touches tags
// that don't already carry a style attribute, so it's safe to run twice.
export function inlineEmailStyles(bodyHtml: string): string {
  let html = bodyHtml;

  // Bulletproof CTA button first, before the generic anchor rule sees it.
  html = html.replace(/<a([^>]*)class="cta-button"([^>]*)>/gi, (_m, pre, post) => {
    const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
    return `<a ${attrs} style="display:inline-block;background-color:#1a6fb5;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold;line-height:1;text-decoration:none;padding:14px 30px;border-radius:4px;">`;
  });

  html = html
    .replace(/<p(?![^>]*style=)/gi, `<p style="${COPY_STYLE}"`)
    .replace(/<h2(?![^>]*style=)/gi, `<h2 style="margin:24px 0 12px;font-family:${FONT};font-size:20px;font-weight:bold;line-height:1.3;color:#111111;"`)
    .replace(/<h3(?![^>]*style=)/gi, `<h3 style="margin:20px 0 10px;font-family:${FONT};font-size:17px;font-weight:bold;line-height:1.3;color:#111111;"`)
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
  const small = `font-family:${FONT};font-size:11px;line-height:1.6;color:#888888;`;
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

// Full document for "build from files" mode. bodyHtml may contain [[IMAGE_n]]
// markers and a CTA anchor with class="cta-button".
export function renderEshotHtml(opts: {
  subject: string;
  bodyHtml: string;
  audienceName?: string;
}): string {
  const styled = inlineEmailStyles(opts.bodyHtml);

  // Split at markers: images become full-bleed rows, copy becomes padded rows.
  const parts = styled.split(/(\[\[IMAGE_\d+\]\])/);
  const rows = parts
    .map((part) => {
      const p = part.trim();
      if (!p) return "";
      if (/^\[\[IMAGE_\d+\]\]$/.test(p)) {
        return `<tr><td style="padding:0;">${p}</td></tr>`;
      }
      return `<tr><td style="padding:24px 32px 12px;">${p}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${opts.subject.replace(/</g, "&lt;")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#f2f2f2;">
  <center>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2">
    <tr><td align="center" style="padding:16px 0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:600px;max-width:100%;">
${rows}
      </table>
${complianceFooter(opts.audienceName)}
    </td></tr>
  </table>
  </center>
</body>
</html>`;
}
