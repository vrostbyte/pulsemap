/**
 * PulseMap — NOAA NWS Active Alerts proxy (Vercel Edge Function).
 *
 * Fetches active weather alerts from the NOAA National Weather Service API.
 * No API key required — this is a fully public US government API.
 *
 * Upstream: https://api.weather.gov/alerts/active
 * Docs:     https://www.weather.gov/documentation/services-web-api
 *
 * Filters to health-relevant alert types only (heat, air quality, cold, fog).
 * Cache: 5 minutes (NWS updates frequently)
 */

export const config = { runtime: 'edge' };

const NWS_URL =
  'https://api.weather.gov/alerts/active' +
  '?status=actual' +
  '&message_type=alert' +
  '&urgency=Immediate,Expected' +
  '&severity=Extreme,Severe';

/** Alert event types with health implications — all others are filtered out. */
const HEALTH_ALERT_TYPES = new Set([
  'Excessive Heat Warning',
  'Excessive Heat Watch',
  'Heat Advisory',
  'Air Quality Alert',
  'Air Quality Watch',
  'Dense Fog Advisory',
  'Extreme Cold Warning',
  'Extreme Cold Watch',
  'Wind Chill Warning',
  'Wind Chill Watch',
  'Wind Chill Advisory',
  'Freeze Warning',
  'Freeze Watch',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface NwsFeature {
  type: string;
  geometry: unknown;
  properties: {
    event?: string;
    headline?: string;
    description?: string;
    severity?: string;
    urgency?: string;
    effective?: string;
    expires?: string;
    areaDesc?: string;
    [key: string]: unknown;
  };
}

interface NwsGeoJsonResponse {
  type: string;
  features: NwsFeature[];
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(NWS_URL, {
      headers: {
        Accept: 'application/geo+json',
        // NWS requires a User-Agent header identifying your application
        'User-Agent': 'PulseMap/0.1 (community health dashboard; contact@example.com)',
      },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `NWS API returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const geojson = (await upstream.json()) as NwsGeoJsonResponse;

    // Filter to health-relevant events and simplify the schema
    const features = (geojson.features ?? [])
      .filter((f) => HEALTH_ALERT_TYPES.has(f.properties.event ?? ''))
      .map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          event:       f.properties.event,
          headline:    f.properties.headline,
          description: f.properties.description,
          severity:    f.properties.severity,
          urgency:     f.properties.urgency,
          effective:   f.properties.effective,
          expires:     f.properties.expires,
          areaDesc:    f.properties.areaDesc,
        },
      }));

    return new Response(JSON.stringify(features), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
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
