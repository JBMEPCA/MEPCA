import Anthropic from "@anthropic-ai/sdk";

// Turns extracted PDF text (a single article, or a whole issue) into a
// ready-to-post LinkedIn post that matches MEPCA's house style. The example
// posts below are JB's real posts and are the source of truth for the format —
// keep them in sync if the house style changes.

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it in Vercel env settings");
  }
  _client ??= new Anthropic();
  return _client;
}

const MODEL = "claude-opus-4-8";

export type PostMode = "article" | "issue";

// JB's real single-article posts — the tone, shape and sign-off to copy.
const ARTICLE_EXAMPLES = `EXAMPLE 1
Engineering is about solving problems, but behind many engineers are people balancing another important role: caring for loved ones.

In the latest edition of MEPCA, we highlight the work of Foothold, the charity supporting engineers and their families, and explore the challenges faced by carers across the profession.

The article explains the support available for engineers with caring responsibilities, from financial and legal advice to wellbeing resources, while encouraging workplaces to create more understanding, supportive environments where carers can thrive.

A big thank you to Foothold for raising awareness of this important topic and the vital support they provide to the engineering community.

Read the full article in the latest edition of MEPCA:
{{LINK}}

#Engineering #Wellbeing #Charity

EXAMPLE 2
In the latest edition of MEPCA, we explore how the long-standing partnership between Titan Enterprises and Grinsty Rail Limited is helping to maintain the performance and longevity of critical rail systems through innovative flow measurement technology.

The article highlights how precise fluid control, durable engineering solutions, and a focus on long-term product availability have enabled Grinsty Rail Limited to support refurbishment programmes, improve system reliability, and meet evolving environmental requirements across the rail sector.

Read the full article in the latest issue of MEPCA:
{{LINK}}

#Engineering #ProcessControl #Manufacturing

EXAMPLE 3
Warehouse automation is transforming manufacturing and SICK Sensor Intelligence is leading by example.

At its factory in Hungary, SICK has expanded production capacity and streamlined intralogistics with an advanced automation solution from KNAPP. From autonomous mobile robots (AMRs) to automated storage and retrieval systems, the project is helping deliver greater efficiency, transparency, and scalability across production logistics.

The result? Faster material flow, optimised stock management, and a future-ready logistics operation designed to support continued growth.

Discover how automation is reshaping modern manufacturing in the latest edition of MEPCA:
{{LINK}}

#Manufacturing #Automation #WarehouseAutomation`;

// JB's real monthly whole-issue post — the exact formula to follow.
const ISSUE_EXAMPLE = `July's Issue of MEPCA is now available online!

The digital issue is live here: ▶ {{LINK}} ◀️

Our July issue places a strong focus on #FacilitiesManagement, exploring the technologies, strategies and expertise helping manufacturers improve operational efficiency, workplace safety and sustainability across their facilities.

🏢 Leading this section, Samsic Facility examines the challenges facing modern facilities management, from AI adoption to predictive maintenance, while Nidec Drives showcases how intelligent intralogistics and automation are transforming material flow across manufacturing environments. We also explore data-driven facility management, wearable safety technology, energy efficiency and the evolving role of FM in operational excellence.

⚙️ On the front cover, LEEA UK LiftEx 2026 takes centre stage, highlighting the UK's premier lifting industry event and why it remains essential for manufacturers looking to improve safety, efficiency and lifting operations.

🏆 In our #ManufacturingChampionOfTheMonth, we celebrate Philip Silver, Managing Director of Advanced Industrial Engineering Ltd (AIE), who shares the story behind the company's growth, the importance of apprenticeships and his advice for the next generation of UK manufacturers.

🤖 This issue also features our Editor's Choice report from the Royal Academy of Engineering's Engineering Intelligence panel discussion, exploring diversity, inclusion and the future of engineering ahead of International Women in Engineering Day.

🔷 Samsic Facility on predictive facilities management and AI adoption
🔷 Nidec Drives on advancing automated material flow
🔷 Philadelphia Scientific UK on data-driven facility management
🔷 Exactaform Cutting Tools on wearable technology for worker safety
🔷 Tork, Essity on the role of FM in company performance
🔷 Dräger on balancing safety and sustainability
🔷 Rollon Group on reducing energy consumption through electric actuation
🔷 Ultimo on digital workers for maintenance teams
🔷 Tinytag by Gemini Data Loggers on how energy is all about data

This issue of MEPCA also includes:

📰 Industry News from Element Six & Orbray Co., Ltd., PTC, GIC Packaging Machinery & Strawson

💬 Opinion pieces from AEMT (The Association of Electrical and Mechanical Trades), Make UK, GAMBICA

📦 Warehouse Automation with KNAPP
🔬 Process Control with Titan Enterprises
⚙️ Injection Moulding with Pentagon Plastics Group Ltd
🦺 Health & Safety with Foothold
🖥️ Digitisation with MRPeasy

📅 Event coverage and previews, including CHEMUKEXPO, The Health & Safety Event, MACH Exhibition and Advanced Engineering UK

View the digital issue here: ▶ {{LINK}} ◀️

#Manufacturing #Engineering #FacilitiesManagement #UKManufacturing`;

const ARTICLE_INSTRUCTIONS = `You are MEPCA Magazine's social media writer. MEPCA is a UK manufacturing and engineering trade magazine. Write a LinkedIn post promoting ONE article.

Follow the house style shown in the examples EXACTLY:
- Warm, professional, factual third-person voice. No hype words ("groundbreaking", "revolutionary", "game-changing").
- UK spelling (optimised, programmes, organisation, centre).
- Name the featured company IN FULL and early (ideally the first sentence) so it can be tagged. Use the company's full brand name as it appears in the article.
- 2-4 short paragraphs: an opening hook, then what the article covers / explains / highlights. Optionally a short closing thought or thank-you where it fits the article (e.g. for a charity or awards piece).
- Then a call-to-read line. Vary it naturally like the examples: "Read the full article in the latest edition of MEPCA:", "Read the full article in the latest issue of MEPCA:", or "Discover how ... in the latest edition of MEPCA:".
- On the NEXT line, output the digital issue link exactly as provided: {{LINK}}
- Then a blank line, then EXACTLY 3 hashtags, space-separated, each starting with a single #, CamelCase, no "hashtag#" prefix. Choose hashtags that fit the article's topic (the first is often #Engineering or #Manufacturing).
- No emojis. No markdown. No preamble or sign-off — output ONLY the post text, ready to paste.`;

const ISSUE_INSTRUCTIONS = `You are MEPCA Magazine's social media writer. MEPCA is a UK manufacturing and engineering trade magazine. Write the monthly WHOLE-ISSUE round-up LinkedIn post from the full issue text.

Follow the formula in the example EXACTLY — same structure, same emojis, same order:
1. First line: "<Month>'s Issue of MEPCA is now available online!" (use the issue's month).
2. Blank line, then: "The digital issue is live here: ▶ {{LINK}} ◀️"
3. Blank line, then the focus paragraph: "Our <Month> issue places a strong focus on #<MainTheme>, exploring the technologies, strategies and expertise ..." — identify the issue's main feature theme and turn it into a hashtag.
4. 🏢 Paragraph on the lead feature section, naming the leading companies and what they cover.
5. ⚙️ Paragraph on the front-cover company/event.
6. 🏆 Paragraph on the #ManufacturingChampionOfTheMonth — name the person, their title and company.
7. 🤖 Paragraph on any Editor's Choice / special report.
8. A list of 🔷 lines — one per featured company: "🔷 <Company> on <what they cover>".
9. "This issue of MEPCA also includes:" then a blank line.
10. 📰 Industry News from <companies>.
11. 💬 Opinion pieces from <organisations>.
12. The section lines with emojis: 📦 Warehouse Automation with ..., 🔬 Process Control with ..., ⚙️ Injection Moulding with ..., 🦺 Health & Safety with ..., 🖥️ Digitisation with ... — use whichever sections and companies actually appear in this issue.
13. 📅 Event coverage and previews, including <events>.
14. "View the digital issue here: ▶ {{LINK}} ◀️"
15. Blank line, then 4 hashtags: #Manufacturing #Engineering #<MainTheme> #UKManufacturing.

Rules:
- Use ONLY companies, people, sections and events that genuinely appear in the issue text. Do NOT invent names — if a section from the example isn't in this issue, leave it out; if there are extra sections, include them in the same style.
- Spell company and people names exactly as written in the issue so they can be tagged.
- UK spelling. Warm, professional voice. Hashtags use a single # with no "hashtag#" prefix.
- Output ONLY the post text, ready to paste — no preamble.`;

export async function generateLinkedInPost(
  mode: PostMode,
  sourceText: string,
  issueLink: string
): Promise<string> {
  const link = issueLink.trim() || "{{LINK}}";
  const instructions = mode === "issue" ? ISSUE_INSTRUCTIONS : ARTICLE_INSTRUCTIONS;
  const examples = mode === "issue" ? ISSUE_EXAMPLE : ARTICLE_EXAMPLES;

  // Guard against runaway payloads while keeping enough for a whole issue.
  const text = sourceText.slice(0, 120_000);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `${instructions}\n\nThe digital issue link to use is: ${link}\n\nHere ${
      mode === "issue" ? "is the reference post" : "are reference posts"
    } written in the correct house style (the link is shown as {{LINK}} — use the real link above in your output):\n\n${examples.replaceAll("{{LINK}}", link)}`,
    messages: [
      {
        role: "user",
        content: `Here is the ${
          mode === "issue" ? "full text of this month's MEPCA issue" : "MEPCA article"
        }, extracted from the PDF. Write the LinkedIn post.\n\n---\n\n${text}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to write this post. Try a different PDF.");
  }
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const post = textBlock?.text?.trim();
  if (!post) throw new Error("No post was generated — try again.");
  return post;
}
