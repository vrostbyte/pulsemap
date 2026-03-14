// src/utils/normalizeRadius.ts
//
// PURPOSE: Single source of truth for how circle sizes are calculated on the map.
// Every data layer imports from here. This guarantees that a "high risk" signal
// looks consistently large and a "low risk" signal looks consistently small,
// regardless of which data source it came from.
//
// HOW IT WORKS:
//   1. Each layer has raw data in different units (AQI 0-500, ILI %, etc.)
//   2. normalizeToRiskIndex() converts any layer's value to a 0-100 risk scale
//   3. getLayerRadius() uses that 0-100 index to compute a meter radius
//   4. Formula: (baseKm + (riskIndex/100) x rangeKm) x 1000 meters

export type LayerType = 'airQuality' | 'wastewater' | 'outbreak' | 'flu' | 'hospital' | 'weather' | 'pollen' | 'wildfire' | 'uv';

interface LayerRadiusConfig {
  baseKm: number;
  rangeKm: number;
  minPixels: number;
  maxPixels: number;
  normalize: (value: number, rawValue?: number) => number;
}

const LAYER_CONFIGS: Record<LayerType, LayerRadiusConfig> = {
  airQuality: {
    baseKm:    8,
    rangeKm:   22,
    minPixels: 4,
    maxPixels: 50,
    normalize: (_value, rawValue) => Math.min(100, ((rawValue ?? 0) / 300) * 100),
  },
  wastewater: {
    baseKm:    10,
    rangeKm:   30,
    minPixels: 6,
    maxPixels: 70,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  outbreak: {
    baseKm:    30,
    rangeKm:   70,
    minPixels: 8,
    maxPixels: 60,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  flu: {
    baseKm:    25,
    rangeKm:   75,
    minPixels: 6,
    maxPixels: 80,
    normalize: (value) => Math.min(100, (value / 10) * 100),
  },
  hospital: {
    baseKm:    5,
    rangeKm:   20,
    minPixels: 4,
    maxPixels: 50,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  weather: {
    baseKm:    20,
    rangeKm:   60,
    minPixels: 6,
    maxPixels: 80,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  pollen: {
    baseKm:    15,
    rangeKm:   45,
    minPixels: 6,
    maxPixels: 50,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  wildfire: {
    baseKm:    5,
    rangeKm:   25,
    minPixels: 4,
    maxPixels: 60,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
  uv: {
    baseKm:    10,
    rangeKm:   25,
    minPixels: 8,
    maxPixels: 60,
    normalize: (value) => Math.max(0, Math.min(100, value)),
  },
};

export function normalizeToRiskIndex(value: number, type: LayerType, rawValue?: number): number {
  return LAYER_CONFIGS[type].normalize(value, rawValue);
}

export function getLayerRadius(value: number, type: LayerType, rawValue?: number): number {
  const config = LAYER_CONFIGS[type];
  const riskIndex = normalizeToRiskIndex(value, type, rawValue);
  return (config.baseKm + (riskIndex / 100) * config.rangeKm) * 1000;
}

export function getLayerPixelConstraints(type: LayerType): { min: number; max: number } {
  const config = LAYER_CONFIGS[type];
  return { min: config.minPixels, max: config.maxPixels };
}
