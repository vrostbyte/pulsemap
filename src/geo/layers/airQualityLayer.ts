/**
 * PulseMap — Air quality deck.gl layer.
 *
 * Renders EPA AirNow AQI observations as scatter circles by ZIP code.
 * Uses the official EPA AQI color scheme (green → yellow → orange → red →
 * purple → maroon) so the map is immediately legible to anyone familiar with
 * air quality reporting.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';

type RGBA = [number, number, number, number];

/**
 * Maps an AQI value to an RGBA colour tuple following the official EPA scale.
 * Alpha is fixed at 200 (translucent) so wastewater circles can show through.
 */
function aqiToColor(aqi: number): RGBA {
  if (aqi <= 50)  return [34,  197,  94, 200];  // green
  if (aqi <= 100) return [245, 158,  11, 200];  // yellow
  if (aqi <= 150) return [249, 115,  22, 210];  // orange
  if (aqi <= 200) return [239,  68,  68, 220];  // red
  if (aqi <= 300) return [124,  58, 237, 230];  // purple
  return                 [127,  29,  29, 255];  // maroon
}

/**
 * Creates a ScatterplotLayer for all airquality HealthSignals.
 *
 * @param signals - Full signal array; filtered internally to type='airquality'
 * @param onHover - Optional hover callback for tooltip integration
 */
export function createAirQualityLayer(
  signals: HealthSignal[],
  onHover?: (info: PickingInfo) => void,
): ScatterplotLayer {
  const data = signals.filter((s) => s.type === 'airquality');

  // Spread onHover only when defined — exactOptionalPropertyTypes prevents
  // passing `undefined` explicitly to a required callback property.
  const hoverProp = onHover ? { onHover } : {};

  return new ScatterplotLayer({
    id: 'airquality-layer',
    data,
    pickable: true,
    opacity: 0.9,
    stroked: false,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 4,
    radiusMaxPixels: 40,

    getPosition: (d: HealthSignal) => [d.longitude, d.latitude],

    // Smaller radius than wastewater — these are zip-level points, not counties
    getRadius: (_d: HealthSignal) => 10_000,

    getFillColor: (d: HealthSignal) => aqiToColor(d.rawValue),

    ...hoverProp,

    updateTriggers: {
      getFillColor: [signals.length],
    },
  });
}
