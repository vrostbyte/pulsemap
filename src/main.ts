/**
 * PulseMap — Application entry point.
 *
 * Wires all components together without a framework:
 *   1. Creates default AppState
 *   2. Mounts MapView (full-viewport WebGL map)
 *   3. Mounts Sidebar (right panel — health score + anomalies + data status)
 *   4. Mounts ZipSearch (top-left overlay)
 *   5. Mounts LayerControls (bottom-left overlay)
 *   6. Mounts AlertBanner (top critical-alert strip)
 *   7. Starts parallel data fetch via the aggregator
 *   8. Listens for user events (zip search, layer toggle) and updates state
 */

import type { AppState, HealthSignal } from '@/types/index.js';
import { TopBar } from '@/components/TopBar/TopBar.js';
import { MapView } from '@/components/Map/MapView.js';
import { Sidebar } from '@/components/Sidebar/Sidebar.js';
import { ZipSearch } from '@/components/ZipSearch/ZipSearch.js';
import type { ZipSearchEventDetail } from '@/components/ZipSearch/ZipSearch.js';
// import { LayerControls } from '@/components/LayerControls/LayerControls.js'; // replaced by Legend component (Sprint 1)
// import type { LayerToggleEventDetail } from '@/components/LayerControls/LayerControls.js'; // replaced by Legend component (Sprint 1)
import { Legend } from '@/components/Legend/Legend.js';
import { AlertBanner } from '@/components/AlertBanner/AlertBanner.js';
import { RiskScoreCard } from '@/components/RiskScore/RiskScore.js';
import { ThingsToKnow } from '@/components/ThingsToKnow/ThingsToKnow.js';
import type { SitrepAnomaly, SitrepPositive } from '@/components/ThingsToKnow/ThingsToKnow.js';
import { fetchAllHealthData, getDataFreshness, computeGlobalScore } from '@/data/aggregator.js';
import { calculateHealthScore } from '@/scoring/communityRiskScore.js';
import { logger } from '@/utils/logger.js';

// ─── App state ────────────────────────────────────────────────────────────────

const state: AppState = {
  selectedZip: null,
  selectedCountyFips: null,
  activeLayerTypes: new Set<HealthSignal['type']>([
    'wastewater',
    'flu',
    'airquality',
    'outbreak',
    'hospital',
    'weather',
  ]),
  signals: [],
  healthScore: null,
  isLoading: false,
  errors: [],
  mapViewState: {
    longitude: -95.71,
    latitude:   37.09,
    zoom:        4,
  },
};

// ─── Mount point ──────────────────────────────────────────────────────────────

const appEl = document.getElementById('app');
if (!appEl) throw new Error('Missing #app element in index.html');

// ─── Initialise components ────────────────────────────────────────────────────

const mapContainer = document.createElement('div');
appEl.appendChild(mapContainer);

const topBar    = new TopBar(appEl);
const mapView   = new MapView(mapContainer);
const sidebar   = new Sidebar(appEl);
const riskCard  = new RiskScoreCard('risk-score-card');
const sitrep    = new ThingsToKnow('sitrep-card');
const zipSearch = new ZipSearch(appEl);
// const layerControls = new LayerControls(appEl, state.activeLayerTypes); // replaced by Legend component (Sprint 1)
const legend = new Legend(appEl);
const alertBanner = new AlertBanner(appEl);

// Suppress unused-variable warning — these are instantiated for side effects only.
void zipSearch;
void legend;

logger.info('PulseMap: components mounted');

// ─── Derived state updates ────────────────────────────────────────────────────

/**
 * Recalculates the health score and pushes it to the sidebar and alert banner.
 * Called after every signal update or county selection change.
 */
function refreshScore(): void {
  if (state.signals.length === 0) return;

  const score = calculateHealthScore(state.signals, state.selectedCountyFips ?? undefined);
  state.healthScore = score;
  sidebar.update(score);

  // Show the alert banner if any critical anomaly is present
  const criticalAnomalies = score.anomalies.filter((a) => a.severity === 'high');
  if (criticalAnomalies.length > 0 && criticalAnomalies[0]) {
    alertBanner.show(criticalAnomalies[0].message);
  } else {
    alertBanner.hide();
  }
}

// ─── Sitrep helpers ───────────────────────────────────────────────────────────

const ANOMALY_DIRECTION: Record<string, string> = {
  low:      'elevated',
  medium:   'rising',
  high:     'deteriorating',
  critical: 'spiking',
};

const ANOMALY_SEVERITY_NUM: Record<string, number> = {
  low:      20,
  medium:   50,
  high:     75,
  critical: 95,
};

const SITREP_SOURCES = [
  { compKey: 'wastewater'       as const, label: 'Wastewater' },
  { compKey: 'fluActivity'      as const, label: 'Flu Activity' },
  { compKey: 'airQuality'       as const, label: 'Air Quality' },
  { compKey: 'hospitalCapacity' as const, label: 'Hospital Capacity' },
  { compKey: 'outbreakAlerts'   as const, label: 'Outbreak' },
];

function anomalySource(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('wastewater'))                          return 'Wastewater';
  if (m.includes('flu') || m.includes('influenza'))      return 'Flu Activity';
  if (m.includes('air') || m.includes('aqi'))            return 'Air Quality';
  if (m.includes('hospital') || m.includes('capacity'))  return 'Hospital Capacity';
  if (m.includes('outbreak'))                            return 'Outbreak';
  return 'Health Signal';
}

// US state abbreviation → full name lookup
// Used to convert raw state codes (e.g. "AL") into readable location names.
const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'Washington D.C.',
};

function anomalyLocation(message: string): string {
  // Try to match a clean place name after "in " — stop before numbers or raw data
  const placeMatch = message.match(/\bin\s+([A-Za-z][A-Za-z\s]{2,30})(?=\s*(area|region|county|metro)?\s*([.–—,]|$))/i);
  if (placeMatch?.[1]) {
    const raw = placeMatch[1].trim();
    // If it looks like a state abbreviation (1-2 uppercase letters), expand it
    const upper = raw.toUpperCase();
    if (STATE_NAMES[upper]) return STATE_NAMES[upper];
    // If it contains digits it is raw data — reject it
    if (/\d/.test(raw)) return 'monitored areas';
    return raw;
  }
  // Try to find a bare state abbreviation anywhere in the message
  const stateMatch = message.match(/\b([A-Z]{2})\b/);
  if (stateMatch?.[1] && STATE_NAMES[stateMatch[1]]) {
    return STATE_NAMES[stateMatch[1]];
  }
  return 'monitored areas';
}

// ─── Data loading ─────────────────────────────────────────────────────────────

/**
 * Loads all health data sources in parallel, updates state, and re-renders
 * the map layers and sidebar.
 */
async function loadData(zip?: string): Promise<void> {
  state.isLoading = true;
  logger.info('loadData: starting fetch', { zip });

  const signals = await fetchAllHealthData(zip);
  state.signals = signals;
  state.isLoading = false;

  mapView.updateLayers(signals, state.activeLayerTypes);
  refreshScore();

  const globalScore = computeGlobalScore([signals]);
  riskCard.update(globalScore, zip !== undefined);
  topBar.setStatus(globalScore);
  topBar.setUpdated();

  const score = state.healthScore;
  if (score) {
    const sitrepAnomalies: SitrepAnomaly[] = score.anomalies.map((a) => ({
      source:    anomalySource(a.message),
      direction: (ANOMALY_DIRECTION[a.severity] ?? 'elevated') as string,
      location:  anomalyLocation(a.message),
      context:   `${a.zScore.toFixed(1)}× above historical average`,
      severity:  (ANOMALY_SEVERITY_NUM[a.severity] ?? 20) as number,
    }));

    const anomalySources = new Set(sitrepAnomalies.map((s) => s.source));
    const sitrepPositives: SitrepPositive[] = SITREP_SOURCES
      .filter((s) => !anomalySources.has(s.label) && score.components[s.compKey] < 50)
      .map((s) => ({
        source:   s.label,
        headline: `${s.label} within normal range`,
        context:  'No elevated signals detected',
      }));

    sitrep.update(sitrepAnomalies, sitrepPositives);
  }

  const freshness = getDataFreshness();
  sidebar.updateSourceFreshness(freshness);
  // layerControls.updateFreshness(freshness); // replaced by Legend component (Sprint 1)

  logger.info(`loadData: rendered ${signals.length} signals`);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Start the initial data load as soon as the map style is ready.
// The inline style fires 'load' almost instantly (no network request).
// The fallback timer ensures data still loads if the map event is delayed.
let dataLoaded = false;

document.addEventListener('map:ready', () => {
  if (dataLoaded) return;
  dataLoaded = true;
  logger.info('map:ready — starting initial data load');
  void loadData();
});

// Fallback: if map:ready hasn't fired within 5 s (e.g. style fetch blocked),
// start loading data anyway so the sidebar and scores are still populated.
setTimeout(() => {
  if (dataLoaded) return;
  dataLoaded = true;
  logger.warn('map:ready timeout — starting data load without map');
  void loadData();
}, 5000);

// Handle ZIP code search
document.addEventListener('search:zip', (e: Event) => {
  const event = e as CustomEvent<ZipSearchEventDetail>;
  const { zip, fips, lat, lng } = event.detail;

  state.selectedZip = zip;
  state.selectedCountyFips = fips;

  // Fly the map to the searched location
  mapView.flyTo(lat, lng, 10);

  // Reload data scoped to this ZIP for AQI (other sources are national)
  void loadData(zip);

  logger.info('search:zip handled', { zip, fips });
});

// Handle layer toggle
document.addEventListener('layer:toggle', (e: Event) => {
  const event = e as CustomEvent<{ type: HealthSignal['type']; active: boolean }>;
  const { type, active } = event.detail;

  if (active) {
    state.activeLayerTypes.add(type);
  } else {
    state.activeLayerTypes.delete(type);
  }

  // Re-render layers with the updated visibility set
  mapView.updateLayers(state.signals, state.activeLayerTypes);
  logger.info('layer:toggle', { type, active });
});
