/**
 * PulseMap — EPA AirNow national coverage proxy (Vercel Edge Function).
 * Uses the AirNow reporting area file feed for national coverage.
 * No API key consumed, no rate limit, ~400 reporting areas updated every 30min.
 * File docs: https://files.airnowtech.org/
 */
export const config = { runtime: 'edge' };

// Pipe-delimited flat file — all current US AQI reporting areas
const AIRNOW_FILE_URL = 'https://files.airnowtech.org/airnow/today/reportingarea.dat';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface AirNowArea {
  lat: number;
  lng: number;
  reportingArea: string;
  stateCode: string;
  aqi: number;
  category: number;
  pollutant: string;
}

function parseDatFile(text: string): AirNowArea[] {
  const results: AirNowArea[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    if (parts.length < 10) continue;
    const lat = parseFloat(parts[8] ?? '');
    const lng = parseFloat(parts[9] ?? '');
    const aqi = parseInt(parts[7] ?? '', 10);
    if (isNaN(lat) || isNaN(lng) || isNaN(aqi) || aqi < 0) continue;
    // Only keep highest AQI per reporting area
    results.push({
      reportingArea: (parts[1] ?? '').trim(),
      stateCode:     (parts[2] ?? '').trim(),
      lat,
      lng,
      aqi,
      category:  parseInt(parts[6] ?? '1', 10),
      pollutant: (parts[5] ?? 'PM2.5').trim(),
    });
  }
  // Deduplicate by reportingArea — keep highest AQI
  const byArea = new Map<string, AirNowArea>();
  for (const area of results) {
    const existing = byArea.get(area.reportingArea);
    if (!existing || area.aqi > existing.aqi) {
      byArea.set(area.reportingArea, area);
    }
  }
  return Array.from(byArea.values());
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(AIRNOW_FILE_URL, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `AirNow file feed returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const text = await upstream.text();
    const areas = parseDatFile(text);

    return new Response(JSON.stringify(areas), {
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
