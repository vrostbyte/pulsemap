/**
 * PulseMap — Central type definitions.
 *
 * All domain types live here so that the rest of the codebase imports from
 * a single source of truth.  No circular dependencies — this file imports
 * nothing from the project itself.
 */

// ─── Health Signal ────────────────────────────────────────────────────────────

/**
 * A normalised, map-renderable data point from any health data source.
 * Every fetcher converts its raw API response into HealthSignal[].
 */
export interface HealthSignal {
  /** Globally unique id (e.g. "wastewater-01001-2024-12-01") */
  id: string;

  /** Which data stream produced this signal */
  type: 'wastewater' | 'flu' | 'airquality' | 'outbreak' | 'hospital' | 'weather' | 'pollen';

  /** Human-readable severity bucket */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** WGS-84 coordinates for rendering on the map */
  latitude: number;
  longitude: number;

  /** FIPS county code (5-digit string, e.g. "06037" for LA County) */
  countyFips?: string | undefined;
  state?: string | undefined;
  zipCode?: string | undefined;

  /** Normalised 0–100 value used for scoring and layer styling */
  value: number;

  /** The original value from the upstream API (e.g. raw AQI = 142) */
  rawValue: number;

  /** Short human-readable description shown in tooltips and the sidebar */
  label: string;

  /** Upstream data provider name, e.g. "CDC NWSS" */
  source: string;

  /** ISO-8601 timestamp of when the upstream data was last updated */
  updatedAt: string;

  /** Arbitrary extra fields preserved for tooltip / detail display */
  metadata: Record<string, unknown>;
}

// ─── Raw API shapes ───────────────────────────────────────────────────────────

/** Parsed row from the CDC National Wastewater Surveillance System. */
export interface WastewaterData {
  countyFips: string;
  countyName: string;
  state: string;
  /** 'low' | 'moderate' | 'high' | 'very high' */
  percentileCategory: string;
  /** Percent change in SARS-CoV-2 signal over the past 15 days */
  percentile: number;
  ptcChangeFrom15d: number;
  firstSampleDateCollected: string;
  latitude: number;
  longitude: number;
}

/** Parsed observation from the EPA AirNow API. */
export interface AirQualityData {
  zipCode: string;
  dateObserved: string;
  /** AQI index value */
  aqi: number;
  /** AQI category string, e.g. "Good", "Moderate", "Unhealthy" */
  category: string;
  /** Primary pollutant driving the AQI, e.g. "PM2.5" */
  pollutant: string;
  latitude: number;
  longitude: number;
}

/** Parsed item from the WHO Disease Outbreak News RSS feed. */
export interface OutbreakAlert {
  id: string;
  title: string;
  country: string;
  disease: string;
  date: string;
  link: string;
  latitude?: number | undefined;
  longitude?: number | undefined;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Composite community health score for a geographic area.
 * Score 0 = excellent health conditions, 100 = critical emergency.
 */
export interface CommunityHealthScore {
  /** Weighted composite 0–100 */
  score: number;

  /** Human-readable tier: 'Good' | 'Moderate' | 'Elevated' | 'High' | 'Critical' */
  label: string;

  /** Individual component scores (each 0–100) used to compose the overall score */
  components: {
    wastewater: number;
    fluActivity: number;
    airQuality: number;
    hospitalCapacity: number;
    outbreakAlerts: number;
  };

  /** Statistical anomalies detected in the current signal set */
  anomalies: AnomalyAlert[];
}

/**
 * A single statistical anomaly found by the z-score detector.
 * Only emitted once a minimum observation window has been reached.
 */
export interface AnomalyAlert {
  /** Short machine-readable type, e.g. "wastewater_spike" */
  type: string;

  /** Human-readable narrative, e.g. "Wastewater signal 2.8× above 90-day average" */
  message: string;

  /** Welford z-score that triggered this alert */
  zScore: number;

  severity: 'low' | 'medium' | 'high';
}

// ─── Application state ────────────────────────────────────────────────────────

/**
 * Single source of truth for the entire client-side application.
 * Mutated directly (no framework reactivity) and passed to components
 * via explicit method calls.
 */
export interface AppState {
  /** Currently entered zip code, or null if none */
  selectedZip: string | null;

  /** FIPS code of the county the user has selected, or null */
  selectedCountyFips: string | null;

  /** Which layer types are currently toggled on in the UI */
  activeLayerTypes: Set<HealthSignal['type']>;

  /** All loaded signals across all data sources */
  signals: HealthSignal[];

  /** Latest computed health score (null until first data load completes) */
  healthScore: CommunityHealthScore | null;

  /** True while any data fetch is in-flight */
  isLoading: boolean;

  /** Non-fatal errors to surface in the UI */
  errors: string[];

  /** deck.gl / MapLibre view state */
  mapViewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
}

// ─── Geo lookup ───────────────────────────────────────────────────────────────

/** Result returned by zipToFips() after a successful Census Geocoding API call. */
export interface FipsResult {
  fips: string;
  lat: number;
  lng: number;
  countyName: string;
  state: string;
}
