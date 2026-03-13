/**
 * PulseMap — CMS Hospital deck.gl layer.
 * Renders hospital capacity signals as circles sized by severity.
 */
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius, getLayerPixelConstraints } from '../../utils/normalizeRadius';

const SEVERITY_COLORS: Record<string, [number, number, number, number]> = {
  critical: [220,  38,  38, 220],
  high:     [234, 100,   0, 200],
  medium:   [234, 179,   8, 180],
  low:      [ 34, 197,  94, 160],
};

export function createHospitalLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const hospitalSignals = signals.filter((s) => s.type === 'hospital');

  return new ScatterplotLayer({
    id: 'hospital-layer',
    data: hospitalSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'hospital'),
    getFillColor: (s: HealthSignal) =>
      SEVERITY_COLORS[s.severity] ?? [34, 197, 94, 160],
    getLineColor: [255, 255, 255, 40],
    getLineWidth: 1,
    stroked: true,
    filled: true,
    radiusUnits: 'meters',
    radiusMinPixels: 4,
    radiusMaxPixels: 50,
    pickable: true,
    onHover,
    updateTriggers: { getRadius: signals.length },
  });
}
