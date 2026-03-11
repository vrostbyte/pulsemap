/**
 * PulseMap — WHO Disease Outbreak News proxy (Vercel Edge Function).
 *
 * Fetches the WHO Disease Outbreak News RSS feed and passes the raw XML
 * through to the browser.  The client uses DOMParser to parse the XML,
 * so no server-side XML parsing is needed here.
 *
 * Upstream RSS: https://www.who.int/feeds/entity/csr/don/en/rss.xml
 * Cache:        30 minutes
 */

export const config = { runtime: 'edge' };

const WHO_RSS_URL = 'https://www.who.int/feeds/entity/csr/don/en/rss.xml';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
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
