/**
 * PulseMap — WHO Disease Outbreak News proxy (Vercel Edge Function).
 * Uses WHO DON JSON API instead of deprecated RSS feed.
 */
export const config = { runtime: 'edge' };

const WHO_DON_URL =
  'https://www.who.int/api/news/diseaseoutbreaknews' +
  '?sf_culture=en&$top=50&$orderby=PublicationDate%20desc';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Country name → [lat, lng] centroid
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Afghanistan': [33.93, 67.71], 'Algeria': [28.03, 1.66],
  'Angola': [-11.20, 17.87], 'Argentina': [-38.42, -63.62],
  'Bangladesh': [23.68, 90.35], 'Bolivia': [-16.29, -63.59],
  'Brazil': [-14.24, -51.93], 'Burkina Faso': [12.36, -1.56],
  'Burundi': [-3.37, 29.92], 'Cambodia': [12.57, 104.99],
  'Cameroon': [7.37, 12.35], 'Central African Republic': [6.61, 20.94],
  'Chad': [15.45, 18.73], 'China': [35.86, 104.20],
  'Colombia': [4.57, -74.30], 'Congo': [-0.23, 15.83],
  'Democratic Republic of the Congo': [-4.04, 21.76],
  'Djibouti': [11.83, 42.59], 'Ecuador': [-1.83, -78.18],
  'Egypt': [26.82, 30.80], 'Ethiopia': [9.15, 40.49],
  'Gabon': [-0.80, 11.61], 'Ghana': [7.95, -1.02],
  'Guinea': [9.95, -11.24], 'Haiti': [18.97, -72.29],
  'Honduras': [15.20, -86.24], 'India': [20.59, 78.96],
  'Indonesia': [-0.79, 113.92], 'Iran': [32.43, 53.69],
  'Iraq': [33.22, 43.68], 'Jordan': [30.59, 36.24],
  'Kenya': [-0.02, 37.91], 'Laos': [19.86, 102.50],
  'Lebanon': [33.85, 35.86], 'Liberia': [6.43, -9.43],
  'Libya': [26.34, 17.23], 'Madagascar': [-18.77, 46.87],
  'Malawi': [-13.25, 34.30], 'Mali': [17.57, -3.99],
  'Mauritania': [21.01, -10.94], 'Mexico': [23.63, -102.55],
  'Morocco': [31.79, -7.09], 'Mozambique': [-18.67, 35.53],
  'Myanmar': [21.91, 95.96], 'Nepal': [28.39, 84.12],
  'Niger': [17.61, 8.08], 'Nigeria': [9.08, 8.68],
  'Pakistan': [30.38, 69.35], 'Peru': [-9.19, -75.02],
  'Philippines': [12.88, 121.77], 'Russia': [61.52, 105.32],
  'Rwanda': [-1.94, 29.87], 'Saudi Arabia': [23.89, 45.08],
  'Senegal': [14.50, -14.45], 'Sierra Leone': [8.46, -11.78],
  'Somalia': [5.15, 46.20], 'South Africa': [-30.56, 22.94],
  'South Sudan': [6.88, 31.57], 'Sudan': [12.86, 30.22],
  'Syria': [34.80, 38.99], 'Tanzania': [-6.37, 34.89],
  'Thailand': [15.87, 100.99], 'Togo': [8.62, 0.82],
  'Turkey': [38.96, 35.24], 'Uganda': [1.37, 32.29],
  'Ukraine': [48.38, 31.17], 'United States': [37.09, -95.71],
  'Venezuela': [6.42, -66.59], 'Vietnam': [14.06, 108.28],
  'Yemen': [15.55, 48.52], 'Zambia': [-13.13, 27.85],
  'Zimbabwe': [-19.02, 29.15],
};

function inferSeverity(title: string): 'low' | 'medium' | 'high' | 'critical' {
  const t = title.toLowerCase();
  if (t.includes('ebola') || t.includes('marburg') || t.includes('pandemic')) return 'critical';
  if (t.includes('outbreak') || t.includes('mpox') || t.includes('cholera')) return 'high';
  if (t.includes('update') || t.includes('avian')) return 'medium';
  return 'low';
}

function extractCountry(title: string): string {
  // Titles follow "Disease – Country – update N" pattern
  const parts = title.split(/[–—-]/);
  if (parts.length >= 2) {
    return parts[parts.length - 1]
      .replace(/update\s*\d+/i, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
  }
  return '';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(WHO_DON_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `WHO returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const json = await upstream.json() as {
      value?: Array<{
        Title: string;
        PublicationDate: string;
        Summary?: string;
      }>;
    };

    const outbreaks = (json.value ?? [])
      .map((item) => {
        const country = extractCountry(item.Title);
        const coords = COUNTRY_COORDS[country];
        return {
          title:    item.Title,
          date:     item.PublicationDate,
          country,
          lat:      coords?.[0] ?? 0,
          lng:      coords?.[1] ?? 0,
          severity: inferSeverity(item.Title),
        };
      })
      .filter(o => o.lat !== 0 && o.lng !== 0);

    return new Response(JSON.stringify(outbreaks), {
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
