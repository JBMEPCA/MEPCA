// MEPCA house style, enforced on every WordPress upload.
// These two rules are mechanical and safe to force in code (not just the AI
// prompt), so they hold even if the model ever slips. Pure string logic —
// safe to use on both server and client.
//
//  - Never use bold (no <strong>/<b>).
//  - Every heading renders as H4 (the standfirst and all section headings).
//
// Title case is handled by the AI prompt instead of here: code can't tell a
// normal lower-case word from a deliberately lower-case brand (igus, xiros),
// so forcing it would corrupt brand names.

export function applyHouseStyle(html: string): string {
  let out = html;

  // Never use bold — unwrap <strong>/<b> (with or without attributes).
  out = out.replace(/<\/?(?:strong|b)(?:\s[^>]*)?>/gi, "");

  // All headings become H4, keeping any attributes on the tag.
  out = out.replace(/<(\/?)h[1-6]\b([^>]*)>/gi, "<$1h4$2>");

  return out;
}
