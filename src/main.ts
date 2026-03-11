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
import { MapView } from '@/components/Map/MapView.js';
import { Sidebar } from '@/components/Sidebar/Sidebar.js';
import { ZipSearch } from '@/components/ZipSearch/ZipSearch.js';
import type { ZipSearchEventDetail } from '@/components/ZipSearch/ZipSearch.js';
import { LayerControls } from '@/components/LayerControls/LayerControls.js';
import type { LayerToggleEventDetail } from '@/components/LayerControls/LayerControls.js';
import { AlertBanner } from '@/components/AlertBanner/AlertBanner.js';
import { fetchAllHealthData, getDataFreshness } from '@/data/aggregator.js';
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

const mapView   = new MapView(mapContainer);
const sidebar   = new Sidebar(appEl);
const zipSearch = new ZipSearch(appEl);
const layerControls = new LayerControls(appEl, state.activeLayerTypes);
const alertBanner = new AlertBanner(appEl);

// Suppress unused-variable warning — zipSearch is instantiated for its side
// effects (DOM mounting + event dispatch).
void zipSearch;

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

  const freshness = getDataFreshness();
  sidebar.updateSourceFreshness(freshness);
  layerControls.updateFreshness(freshness);

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
  const event = e as CustomEvent<LayerToggleEventDetail>;
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
