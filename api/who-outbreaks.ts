/**
 * PulseMap — WHO Disease Outbreak News proxy (Vercel Edge Function).
 *
 * Fetches the WHO Disease Outbreak News RSS feed and converts it to JSON
 * so the browser client doesn't need to parse XML or deal with CORS.
 *
 * Uses a hand-rolled regex XML parser to avoid npm dependencies
 * (Edge Functions can't use npm packages that aren't bundled).
 *
 * Upstream RSS: https://www.who.int/rss-feeds/news-releases.xml
 * Cache:        30 minutes
 */

export const config = { runtime: 'edge' };

const WHO_RSS_URL = 'https://www.who.int/rss-feeds/news-releases.xml';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Minimal XML parser ───────────────────────────────────────────────────────

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

/**
 * Extracts the text content of the first occurrence of a named XML tag.
 * Handles CDATA sections.  Does not handle nested tags of the same name.
 */
function extractTag(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'si');
  const match = pattern.exec(xml);
  return match?.[1]?.trim() ?? '';
}

/**
 * Parses <item> blocks from an RSS XML string into plain objects.
 * Returns at most 50 items (the feed contains ~20–30 for recent news).
 */
function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Split on <item> boundaries
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null && items.length < 50) {
    const block = match[1] ?? '';
    items.push({
      title:       extractTag(block, 'title'),
      link:        extractTag(block, 'link'),
      pubDate:     extractTag(block, 'pubDate'),
      description: extractTag(block, 'description'),
    });
  }

  return items;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(WHO_RSS_URL, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `WHO RSS returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const xml = await upstream.text();
    const items = parseRss(xml);

    return new Response(JSON.stringify(items), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
