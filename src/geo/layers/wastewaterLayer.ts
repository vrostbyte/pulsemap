/**
 * PulseMap — Wastewater surveillance deck.gl layer.
 *
 * Renders CDC NWSS wastewater signals as translucent scatter circles.
 * Color encodes severity from low (purple) to critical (bright red/magenta).
 * Circle radius scales with the normalised signal value so high-burden
 * counties are visually dominant.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius, getLayerPixelConstraints } from '../../utils/normalizeRadius';

/** RGBA color tuples keyed by severity */
const COLORS: Record<HealthSignal['severity'], [number, number, number, number]> = {
  low:      [123,  45, 139, 160],
  medium:   [180,  45, 139, 200],
  high:     [220,  45, 100, 220],
  critical: [255,   0,  80, 255],
};

/**
 * Creates a ScatterplotLayer for all wastewater HealthSignals.
 *
 * @param signals - Full signal array; filtered internally to type='wastewater'
 * @param onHover - Optional hover callback for tooltip integration
 */
export function createWastewaterLayer(
  signals: HealthSignal[],
  onHover?: (info: PickingInfo) => void,
): ScatterplotLayer {
  const data = signals.filter((s) => s.type === 'wastewater');

  // Spread onHover only when defined — exactOptionalPropertyTypes prevents
  // passing `undefined` explicitly to a required callback property.
  const hoverProp = onHover ? { onHover } : {};

  return new ScatterplotLayer({
    id: 'wastewater-layer',
    data,
    pickable: true,
    opacity: 0.8,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 6,
    radiusMaxPixels: 70,
    lineWidthMinPixels: 1,

    getPosition: (d: HealthSignal) => [d.longitude, d.latitude],

    getRadius: (d: HealthSignal) => getLayerRadius(d.value, 'wastewater'),

    getFillColor: (d: HealthSignal) => COLORS[d.severity],

    getLineColor: (d: HealthSignal) => {
      const c = COLORS[d.severity];
      // Slightly brighter outline
      return [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40), 255] as [number, number, number, number];
    },

    ...hoverProp,

    updateTriggers: {
      getFillColor: [signals.length],
      getRadius: [signals.length],
    },
  });
}
