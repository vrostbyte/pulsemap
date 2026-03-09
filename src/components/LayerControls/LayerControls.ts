/**
 * PulseMap — LayerControls component.
 *
 * A floating panel of toggle buttons in the bottom-left corner.  Each button
 * controls the visibility of one deck.gl data layer and shows the data's age.
 *
 * Custom events dispatched:
 *   'layer:toggle'  — { detail: { type: HealthSignal['type'], active: boolean } }
 */

import type { HealthSignal } from '@/types/index.js';
import { timeAgo } from '@/utils/formatters.js';

// ─── Layer configuration ──────────────────────────────────────────────────────

interface LayerConfig {
  type: HealthSignal['type'];
  label: string;
  color: string;
}

const LAYERS: LayerConfig[] = [
  { type: 'wastewater', label: 'Wastewater',   color: '#7B2D8B' },
  { type: 'flu',        label: 'Flu Activity', color: '#E05B00' },
  { type: 'airquality', label: 'Air Quality',  color: '#0077B6' },
  { type: 'outbreak',   label: 'Outbreaks',    color: '#CC0000' },
  { type: 'hospital',   label: 'Hospitals',    color: '#00796B' },
  { type: 'weather',    label: 'Weather',      color: '#F59E0B' },
];

export interface LayerToggleEventDetail {
  type: HealthSignal['type'];
  active: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export class LayerControls {
  private container: HTMLElement;
  private activeTypes: Set<HealthSignal['type']>;
  private freshnessMap: Map<string, string> = new Map();
  private buttons: Map<HealthSignal['type'], { btn: HTMLButtonElement; freshnessEl: HTMLSpanElement }> = new Map();

  constructor(mountPoint: HTMLElement, initialActive: Set<HealthSignal['type']>) {
    this.activeTypes = new Set(initialActive);

    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;bottom:32px;left:16px;z-index:100;' +
      'background:rgba(10,15,26,0.85);border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:10px;padding:12px;backdrop-filter:blur(10px);' +
      'display:flex;flex-direction:column;gap:4px;min-width:180px;';

    const title = document.createElement('div');
    title.textContent = 'Data Layers';
    title.style.cssText =
      'color:#8892a4;font-size:11px;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:0.08em;margin-bottom:4px;font-family:system-ui,sans-serif;';
    this.container.appendChild(title);

    for (const layer of LAYERS) {
      const { btn, freshnessEl } = this.createButton(layer);
      this.buttons.set(layer.type, { btn, freshnessEl });
      this.container.appendChild(btn);
    }

    mountPoint.appendChild(this.container);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private createButton(
    layer: LayerConfig,
  ): { btn: HTMLButtonElement; freshnessEl: HTMLSpanElement } {
    const isActive = this.activeTypes.has(layer.type);

    const btn = document.createElement('button');
    btn.style.cssText =
      'display:flex;align-items:center;gap:8px;background:none;' +
      `border:1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'transparent'};` +
      'border-radius:6px;padding:6px 8px;cursor:pointer;' +
      'transition:background 0.15s,border-color 0.15s;width:100%;text-align:left;';
    btn.setAttribute('aria-pressed', String(isActive));
    btn.setAttribute('aria-label', `Toggle ${layer.label} layer`);

    const dot = document.createElement('span');
    dot.style.cssText =
      `width:10px;height:10px;border-radius:50%;flex-shrink:0;` +
      `background:${layer.color};opacity:${isActive ? '1' : '0.4'};transition:opacity 0.15s;`;

    const nameEl = document.createElement('span');
    nameEl.textContent = layer.label;
    nameEl.style.cssText =
      `color:#fff;font-size:13px;font-family:system-ui,sans-serif;flex:1;` +
      `opacity:${isActive ? '1' : '0.5'};transition:opacity 0.15s;`;

    const freshnessEl = document.createElement('span');
    freshnessEl.style.cssText = 'color:#8892a4;font-size:10px;font-family:system-ui,sans-serif;';

    btn.appendChild(dot);
    btn.appendChild(nameEl);
    btn.appendChild(freshnessEl);

    btn.addEventListener('click', () => {
      const nowActive = !this.activeTypes.has(layer.type);

      if (nowActive) {
        this.activeTypes.add(layer.type);
      } else {
        this.activeTypes.delete(layer.type);
      }

      // Update visual state
      dot.style.opacity = nowActive ? '1' : '0.4';
      nameEl.style.opacity = nowActive ? '1' : '0.5';
      btn.style.borderColor = nowActive ? 'rgba(255,255,255,0.1)' : 'transparent';
      btn.setAttribute('aria-pressed', String(nowActive));

      document.dispatchEvent(
        new CustomEvent<LayerToggleEventDetail>('layer:toggle', {
          detail: { type: layer.type, active: nowActive },
        }),
      );
    });

    return { btn, freshnessEl };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Updates the freshness timestamps shown next to each layer button.
   * Call after fetchAllHealthData() resolves.
   *
   * @param freshness - Map from source name to ISO timestamp
   */
  updateFreshness(freshness: Map<string, string>): void {
    this.freshnessMap = freshness;

    // Map source names to layer types
    const sourceToType: Record<string, HealthSignal['type']> = {
      'CDC Wastewater': 'wastewater',
      'CDC FluView':    'flu',
      'EPA AirNow':     'airquality',
      'WHO Outbreaks':  'outbreak',
      'CMS Hospitals':  'hospital',
      'NWS Alerts':     'weather',
    };

    for (const [source, timestamp] of freshness) {
      const type = sourceToType[source];
      if (!type) continue;
      const entry = this.buttons.get(type);
      if (entry) {
        entry.freshnessEl.textContent = timeAgo(timestamp);
      }
    }
  }
}
