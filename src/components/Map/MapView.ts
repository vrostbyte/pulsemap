/**
 * PulseMap — MapView component.
 *
 * Manages the MapLibre GL map instance and integrates deck.gl as a custom
 * layer via MapboxOverlay (which is MapLibre-compatible despite the name).
 *
 * Responsibilities:
 * - Create and mount the full-viewport map
 * - Accept HealthSignal[] and rebuild deck.gl layers on each update
 * - Expose flyTo() for ZIP code search navigation
 * - Dispatch 'map:ready' when the map finishes loading
 * - Render hover tooltips for deck.gl layers
 */

import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { createWastewaterLayer } from '@/geo/layers/wastewaterLayer.js';
import { createAirQualityLayer } from '@/geo/layers/airQualityLayer.js';
import { createOutbreakLayers } from '@/geo/layers/outbreakLayer.js';
import { createFluLayer } from '@/geo/layers/fluLayer.js';
import { createHospitalLayer } from '@/geo/layers/hospitalLayer.js';
import { createHeatLayer } from '@/geo/layers/heatLayer.js';

// ─── Minimal offline map style ────────────────────────────────────────────────
// A self-contained MapLibre style with no external tile sources.
// This means the map works without any network access — deck.gl layers
// (wastewater, AQI, outbreaks…) render fine on top of this dark canvas.
// Swap this for a richer hosted style (Stadia, MapTiler, etc.) in production.
const DARK_INLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'PulseMap Dark',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0a0f1a' },
    },
  ],
};

// ─── Tooltip helpers ──────────────────────────────────────────────────────────

function buildTooltipHtml(signal: HealthSignal): string {
  const metaLines: string[] = [];

  if (signal.type === 'wastewater') {
    const cat = signal.metadata['percentileCategory'] as string | undefined;
    const change = signal.metadata['ptcChangeFrom15d'] as number | undefined;
    if (cat) metaLines.push(`Category: ${cat}`);
    if (change !== undefined) metaLines.push(`15-day change: ${change > 0 ? '+' : ''}${change.toFixed(1)}%`);
  } else if (signal.type === 'airquality') {
    const category = signal.metadata['category'] as string | undefined;
    const pollutant = signal.metadata['pollutant'] as string | undefined;
    if (category) metaLines.push(`Category: ${category}`);
    if (pollutant) metaLines.push(`Pollutant: ${pollutant}`);
    metaLines.push(`AQI: ${signal.rawValue}`);
  } else if (signal.type === 'outbreak') {
    const country = signal.metadata['country'] as string | undefined;
    const disease = signal.metadata['disease'] as string | undefined;
    if (disease) metaLines.push(`Disease: ${disease}`);
    if (country) metaLines.push(`Country: ${country}`);
  }

  const metaHtml = metaLines
    .map((l) => `<div style="color:#8892a4;font-size:12px;">${l}</div>`)
    .join('');

  return `<div style="font-weight:600;margin-bottom:4px;color:#00d4ff;">${signal.label}</div>${metaHtml}`;
}

// ─── MapView class ────────────────────────────────────────────────────────────

export class MapView {
  private map: maplibregl.Map;
  private overlay: MapboxOverlay;
  private tooltipEl: HTMLDivElement;
  private container: HTMLElement;
  private hiddenLayers: Set<string> = new Set();
  private lastSignals: HealthSignal[] = [];
  private lastActiveTypes: Set<HealthSignal['type']> = new Set(['wastewater', 'flu', 'airquality', 'outbreak', 'hospital', 'weather']);

  constructor(container: HTMLElement) {
    this.container = container;

    // Apply full-viewport styling to the container element
    container.style.cssText =
      'position:fixed;top:48px;left:0;right:0;height:calc(100vh - 48px);background:#0a0f1a;';

    this.map = new maplibregl.Map({
      container,
      // CARTO dark matter tiles — free, no API key required
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-95.71, 37.09], // Centred on continental USA
      zoom: 4,
      // Pass an options object instead of `true` to satisfy MapLibre v4 types
      attributionControl: {},
    });

    // deck.gl overlay — renders WebGL layers on top of MapLibre tiles
    this.overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });

    // MapboxOverlay implements IControl, compatible with MapLibre
    this.map.addControl(this.overlay as unknown as maplibregl.IControl);

    // Tooltip element — all styles inline, no CSS Modules needed
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'position:absolute;pointer-events:none;display:none;' +
      'background:rgba(13,19,33,0.95);border:1px solid rgba(255,255,255,0.12);' +
      'border-radius:6px;padding:8px 12px;color:#fff;font-size:13px;' +
      'line-height:1.5;max-width:240px;box-shadow:0 4px 20px rgba(0,0,0,0.5);' +
      'backdrop-filter:blur(10px);z-index:10;transform:translate(-50%,-110%);' +
      'font-family:system-ui,sans-serif;';
    container.appendChild(this.tooltipEl);

    // Dispatch 'map:ready' once tiles have loaded
    this.map.on('load', () => {
      document.dispatchEvent(new CustomEvent('map:ready'));
    });

    // Listen for Legend toggle events — show/hide individual deck.gl layers
    window.addEventListener('legend:toggle', (e: Event) => {
      const { layer, visible } = (e as CustomEvent<{ layer: string; visible: boolean }>).detail;
      if (visible) {
        this.hiddenLayers.delete(layer);
      } else {
        this.hiddenLayers.add(layer);
      }
      this.rerenderLayers();
    });
  }

  // ─── Hover handler ──────────────────────────────────────────────────────────

  private handleHover = (info: PickingInfo): void => {
    if (info.object) {
      const signal = info.object as HealthSignal;
      this.tooltipEl.innerHTML = buildTooltipHtml(signal);
      this.tooltipEl.style.left = `${info.x}px`;
      this.tooltipEl.style.top = `${info.y}px`;
      this.tooltipEl.style.display = 'block';
    } else {
      this.tooltipEl.style.display = 'none';
    }
  };

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Rebuilds all visible deck.gl layers from the current signal set.
   * Filters each layer to only the relevant signal types internally.
   *
   * @param signals - Full merged signal array from the aggregator
   * @param activeTypes - Set of layer types to render (others are hidden)
   */
  updateLayers(
    signals: HealthSignal[],
    activeTypes?: Set<HealthSignal['type']>,
  ): void {
    this.lastSignals = signals;
    this.lastActiveTypes = activeTypes ?? new Set<HealthSignal['type']>(['wastewater', 'flu', 'airquality', 'outbreak', 'hospital', 'weather']);
    this.rerenderLayers();
  }

  private rerenderLayers(): void {
    const active = this.lastActiveTypes;
    const signals = this.lastSignals;
    const layers: Layer[] = [];

    if (active.has('wastewater') && !this.hiddenLayers.has('wastewater')) {
      layers.push(createWastewaterLayer(signals, this.handleHover));
    }

    if (active.has('flu') && !this.hiddenLayers.has('flu')) {
      layers.push(createFluLayer(signals, this.handleHover));
    }

    if (active.has('airquality') && !this.hiddenLayers.has('airQuality')) {
      layers.push(createAirQualityLayer(signals, this.handleHover));
    }

    if (active.has('outbreak') && !this.hiddenLayers.has('outbreaks')) {
      layers.push(...createOutbreakLayers(signals, this.handleHover));
    }

    if (active.has('hospital') && !this.hiddenLayers.has('hospitals')) {
      layers.push(createHospitalLayer(signals, this.handleHover));
    }

    if (active.has('weather') && !this.hiddenLayers.has('heatAlerts')) {
      layers.push(createHeatLayer(signals, this.handleHover));
    }

    this.overlay.setProps({ layers });
  }

  /**
   * Smoothly flies the map camera to the given coordinates.
   * Used by ZipSearch after resolving a ZIP code to lat/lng.
   */
  flyTo(lat: number, lng: number, zoom = 10): void {
    this.map.flyTo({ center: [lng, lat], zoom, duration: 1500 });
  }

  /** Returns the underlying MapLibre map instance for advanced usage. */
  getMap(): maplibregl.Map {
    return this.map;
  }
}
