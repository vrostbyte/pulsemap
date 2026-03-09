/**
 * PulseMap — ZIP → FIPS county code + centroid lookup.
 *
 * Uses the free US Census Bureau Geocoding API (no key required).
 * Results are cached in memory for the lifetime of the browser session so
 * that repeated searches for the same ZIP don't hit the network twice.
 *
 * Throws ZipNotFoundError when the Census API cannot resolve the ZIP.
 */

import type { FipsResult } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when a ZIP code cannot be resolved to a county FIPS + centroid. */
export class ZipNotFoundError extends Error {
  constructor(zip: string) {
    super(`ZIP code "${zip}" could not be resolved to a county.`);
    this.name = 'ZipNotFoundError';
  }
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

/** Session-scoped cache.  Cleared on page reload — no persistence needed. */
const cache = new Map<string, FipsResult>();

// ─── Census API types ─────────────────────────────────────────────────────────

interface CensusGeocodeResponse {
  result?: {
    addressMatches?: Array<{
      coordinates?: { x: number; y: number };
      geographies?: {
        Counties?: Array<{
          GEOID?: string;
          NAME?: string;
          'State Code'?: string;
        }>;
      };
    }>;
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves a 5-digit US ZIP code to its containing county FIPS code, centroid
 * coordinates, county name, and 2-letter state abbreviation.
 *
 * @throws {ZipNotFoundError} if the Census API returns no match
 * @throws {Error} on network failure
 */
export async function zipToFips(zip: string): Promise<FipsResult> {
  // Return cached result immediately if available
  const cached = cache.get(zip);
  if (cached !== undefined) return cached;

  const url =
    `https://geocoding.geo.census.gov/geocoder/geographies/address` +
    `?benchmark=Public_AR_Current` +
    `&vintage=Current_Current` +
    `&format=json` +
    `&zip=${encodeURIComponent(zip)}`;

  logger.debug('zipToFips: fetching Census Geocoding API', { zip, url });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Census Geocoding API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as CensusGeocodeResponse;

  const matches = data.result?.addressMatches;
  if (!matches || matches.length === 0) {
    throw new ZipNotFoundError(zip);
  }

  const match = matches[0];
  if (!match) throw new ZipNotFoundError(zip);

  const coords = match.coordinates;
  if (!coords) throw new ZipNotFoundError(zip);

  const counties = match.geographies?.Counties;
  if (!counties || counties.length === 0) {
    throw new ZipNotFoundError(zip);
  }

  const county = counties[0];
  if (!county) throw new ZipNotFoundError(zip);

  const fips = county.GEOID;
  const countyName = county.NAME;
  const stateCode = county['State Code'];

  if (!fips || !countyName || !stateCode) {
    throw new ZipNotFoundError(zip);
  }

  const result: FipsResult = {
    fips,
    // Census API uses (x=longitude, y=latitude) convention
    lat: coords.y,
    lng: coords.x,
    countyName,
    state: stateCode,
  };

  cache.set(zip, result);
  logger.info('zipToFips: resolved', result);
  return result;
}
