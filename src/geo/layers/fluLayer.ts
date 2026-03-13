/**
 * PulseMap — CDC FluView deck.gl layer.
 * Renders ILI % by HHS region as pulsing circles on the map.
 */
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius, getLayerPixelConstraints } from '../../utils/normalizeRadius';

const SEVERITY_COLORS: Record<string, [number, number, number, number]> = {
  critical: [255,  50,  50, 220],
  high:     [255, 140,   0, 200],
  medium:   [255, 200,   0, 180],
  low:      [100, 200, 100, 160],
};

export function createFluLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const fluSignals = signals.filter((s) => s.type === 'flu');

  return new ScatterplotLayer({
    id: 'flu-layer',
    data: fluSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'flu'),
    getFillColor: (s: HealthSignal) =>
      SEVERITY_COLORS[s.severity] ?? [100, 200, 100, 160],
    getLineColor: [255, 255, 255, 60],
    getLineWidth: 1,
    stroked: true,
    filled: true,
    radiusUnits: 'meters',
    radiusMinPixels: 6,
    radiusMaxPixels: 80,
    pickable: true,
    onHover,
    updateTriggers: { getRadius: signals.length },
  });
}
