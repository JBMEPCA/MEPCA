import Anthropic from "@anthropic-ai/sdk";

// The watcher's intelligence: Claude identifies genuine third-party advertisers,
// applying the same judgement as the mepca-competitor-advertisers skill
// (exclude house ads, subscription plugs, event promos by the publisher itself).

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it in Vercel env settings");
  }
  _client ??= new Anthropic();
  return _client;
}

const MODEL = "claude-opus-4-8";

export type FoundAdvertiser = {
  brand: string;
  adType: string;
  whereFound: string;
  confidence: string;
};

const advertiserSchema = {
  type: "object" as const,
  properties: {
    advertisers: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          brand: { type: "string" as const, description: "Company/brand name of the advertiser" },
          adType: { type: "string" as const, description: "e.g. 'Website banner (leaderboard)', 'Full page print ad'" },
          whereFound: { type: "string" as const, description: "Where the ad appears (page/section/page number)" },
          confidence: { type: "string" as const, description: "e.g. 'Confirmed - live banner' or 'Likely - partial view'" },
        },
        required: ["brand", "adType", "whereFound", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["advertisers"],
  additionalProperties: false,
};

const HOUSE_AD_RULES = `Rules for what counts as an advertiser:
- Only genuine THIRD-PARTY companies paying to advertise. These are prospective ad clients for MEPCA Magazine (UK manufacturing/engineering/logistics trade title).
- EXCLUDE house ads: the publisher promoting its own magazines, newsletters, subscriptions, media packs, events, awards, webinars, or sister titles.
- EXCLUDE editorial mentions, article sponsors' logos inside editorial, navigation links, social media buttons, and stock/ad-network placeholder ads (Google AdSense generics etc.).
- INCLUDE branded banners, display ads, sponsored content clearly paid for by an industrial/manufacturing/logistics company.
- Normalise brand names (e.g. "SICK Sensor Intelligence" -> "SICK").`;

export async function classifyWebsiteAds(
  siteName: string,
  pageUrl: string,
  candidates: { href: string; imgSrc: string; alt: string }[]
): Promise<FoundAdvertiser[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map((c, i) => `${i + 1}. link: ${c.href}\n   image: ${c.imgSrc}\n   alt text: ${c.alt || "(none)"}`)
    .join("\n");

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: advertiserSchema } },
    messages: [
      {
        role: "user",
        content: `You are scanning the website of "${siteName}" (${pageUrl}), a competitor trade magazine, for display/banner advertisers.

${HOUSE_AD_RULES}

Below are the candidate ad placements extracted from the page (linked images and embeds). Identify which are genuine third-party advertisers. Use the link destination domain and alt text to identify the brand. Deduplicate brands.

${candidateList}`,
      },
    ],
  });

  return parseAdvertisers(response);
}

export async function scanPdfForAdvertisers(
  magazineName: string,
  pdfBase64: string
): Promise<FoundAdvertiser[]> {
  // Magazine PDFs are large — stream to avoid HTTP timeouts
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: advertiserSchema } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: `This is an issue of "${magazineName}", a competitor trade magazine. Go through every page and list all third-party display advertisers (full page, half page, quarter page ads etc.).

${HOUSE_AD_RULES}

For whereFound, give the page number. Deduplicate brands (one entry per brand, note multiple placements in whereFound).`,
          },
        ],
      },
    ],
  });

  const response = await stream.finalMessage();
  return parseAdvertisers(response);
}

function parseAdvertisers(response: Anthropic.Message): FoundAdvertiser[] {
  if (response.stop_reason === "refusal") return [];
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!textBlock) return [];
  try {
    const parsed = JSON.parse(textBlock.text) as { advertisers: FoundAdvertiser[] };
    return parsed.advertisers ?? [];
  } catch {
    return [];
  }
}
