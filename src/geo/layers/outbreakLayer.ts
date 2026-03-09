/**
 * PulseMap — WHO outbreak alert deck.gl layer.
 *
 * Renders outbreak alerts as pulsing double-ring ScatterplotLayer circles
 * (two layers stacked — a solid inner circle and a larger translucent outer
 * ring — to create the "pulse" visual effect without needing animation).
 *
 * A true animated pulse would require requestAnimationFrame updates to the
 * deck.gl overlay; the double-ring approximation is intentional for MVP to
 * keep the implementation simple and performant.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';

type RGBA = [number, number, number, number];

const SEVERITY_COLORS: Record<HealthSignal['severity'], RGBA> = {
  low:      [ 34, 197,  94, 180],
  medium:   [245, 158,  11, 200],
  high:     [239,  68,  68, 220],
  critical: [204,   0,   0, 255],
};

/**
 * Creates two ScatterplotLayers that together simulate a pulsing alert pin:
 * 1. Inner solid circle (the "core")
 * 2. Outer translucent ring (the "pulse halo")
 *
 * @param signals - Full signal array; filtered internally to type='outbreak'
 * @param onHover - Optional hover callback for tooltip integration
 */
export function createOutbreakLayers(
  signals: HealthSignal[],
  onHover?: (info: PickingInfo) => void,
): [ScatterplotLayer, ScatterplotLayer] {
  const data = signals.filter((s) => s.type === 'outbreak');

  // Spread onHover only when defined — exactOptionalPropertyTypes prevents
  // passing `undefined` explicitly to a required callback property.
  const hoverProp = onHover ? { onHover } : {};

  const innerLayer = new ScatterplotLayer({
    id: 'outbreak-inner-layer',
    data,
    pickable: true,
    opacity: 1,
    stroked: false,
    filled: true,
    radiusMinPixels: 6,
    radiusMaxPixels: 20,

    getPosition: (d: HealthSignal) => [d.longitude, d.latitude],
    getRadius: (_d: HealthSignal) => 30_000,
    getFillColor: (d: HealthSignal) => SEVERITY_COLORS[d.severity],

    ...hoverProp,

    updateTriggers: { getFillColor: [signals.length] },
  });

  const outerLayer = new ScatterplotLayer({
    id: 'outbreak-outer-layer',
    data,
    pickable: false,
    opacity: 0.35,
    stroked: true,
    filled: false,
    lineWidthMinPixels: 2,
    radiusMinPixels: 12,
    radiusMaxPixels: 40,

    getPosition: (d: HealthSignal) => [d.longitude, d.latitude],
    getRadius: (_d: HealthSignal) => 70_000,
    getLineColor: (d: HealthSignal) => SEVERITY_COLORS[d.severity],

    updateTriggers: { getLineColor: [signals.length] },
  });

  return [outerLayer, innerLayer];
}
