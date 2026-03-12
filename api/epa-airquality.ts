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

// Category name → numeric severity (matches EPA AQI scale)
const CATEGORY_MAP: Record<string, number> = {
  'Good': 1, 'Moderate': 2,
  'Unhealthy for Sensitive Groups': 3,
  'Unhealthy': 4, 'Very Unhealthy': 5, 'Hazardous': 6,
};

function parseDatFile(text: string): AirNowArea[] {
  // Actual column layout (pipe-delimited):
  // 0=forecast_date 1=obs_date 2=obs_time 3=tz 4=offset
  // 5=data_type(O=current,Y=yesterday) 6=primary(Y/N)
  // 7=area_name 8=state 9=lat 10=lng 11=pollutant 12=aqi 13=category
  const byArea = new Map<string, AirNowArea>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const p = line.split('|');
    if (p.length < 14) continue;
    // Only current observations, primary pollutant per area
    if ((p[5] ?? '').trim() !== 'O') continue;
    if ((p[6] ?? '').trim() !== 'Y') continue;
    const lat = parseFloat(p[9] ?? '');
    const lng = parseFloat(p[10] ?? '');
    const aqi = parseInt(p[12] ?? '', 10);
    if (isNaN(lat) || isNaN(lng) || isNaN(aqi) || aqi < 0) continue;
    const area: AirNowArea = {
      reportingArea: (p[7] ?? '').trim(),
      stateCode:     (p[8] ?? '').trim(),
      lat,
      lng,
      aqi,
      category:  CATEGORY_MAP[(p[13] ?? '').trim()] ?? 1,
      pollutant: (p[11] ?? 'PM2.5').trim(),
    };
    // Keep highest AQI per reporting area
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
