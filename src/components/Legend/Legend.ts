// src/components/Legend/Legend.ts
//
// Floating map legend that doubles as a layer toggle control.
// Replaces the separate LayerControls panel.
//
// HOW TOGGLING WORKS:
//   1. User clicks a layer row
//   2. Legend flips the layer's visible state internally
//   3. Legend fires a custom 'legend:toggle' window event:
//        { detail: { layer: 'wastewater', visible: false } }
//   4. MapView listens for 'legend:toggle' and shows/hides the deck.gl layer
//
// This keeps Legend and MapView decoupled — they communicate only via events,
// neither needs a direct reference to the other.
//
// LAYER COLORS:
//   These must match the actual colors used in each layer's deck.gl ScatterplotLayer.
//   If you change a layer's color, update LAYERS here too.

import './Legend.css';

// ─── Layer definitions ────────────────────────────────────────────────────────

interface LayerDef {
  /** Key used in 'legend:toggle' event — must match MapView's layer id */
  id: string;
  emoji: string;
  label: string;
  /** CSS color string matching the deck.gl layer's getFillColor */
  color: string;
}

const LAYERS: LayerDef[] = [
  { id: 'wastewater', emoji: '💧', label: 'Wastewater',   color: '#8b5cf6' },
  { id: 'flu',        emoji: '🤧', label: 'Flu Activity', color: '#f59e0b' },
  { id: 'airQuality', emoji: '💨', label: 'Air Quality',  color: '#06b6d4' },
  { id: 'outbreaks',  emoji: '🌍', label: 'Outbreaks',    color: '#ef4444' },
  { id: 'hospitals',  emoji: '🏥', label: 'Hospitals',    color: '#22c55e' },
  { id: 'heatAlerts', emoji: '🌡️', label: 'Heat Alerts',  color: '#ff4500' },
];

// ─── Severity key ─────────────────────────────────────────────────────────────

const SEVERITY = [
  { label: 'Low',      color: '#00e676' },
  { label: 'Moderate', color: '#ffcc02' },
  { label: 'High',     color: '#ff6d00' },
  { label: 'Critical', color: '#ff1744' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export class Legend {
  private el: HTMLElement;
  /** Tracks which layers are currently visible */
  private visibility: Map<string, boolean> = new Map();

  /**
   * @param mountPoint  The element to append the legend into (usually document.body or appEl)
   */
  constructor(mountPoint: HTMLElement) {
    // All layers start visible
    for (const layer of LAYERS) {
      this.visibility.set(layer.id, true);
    }

    this.el = document.createElement('div');
    this.el.className = 'legend';
    this.el.innerHTML = this.buildHTML();
    mountPoint.appendChild(this.el);

    this.attachListeners();
  }

  // ─── HTML template ───────────────────────────────────────────────────────────

  private buildHTML(): string {
    const rowsHTML = LAYERS.map(layer => `
      <div class="legend__row" data-layer="${layer.id}">
        <div class="legend__dot" style="background:${layer.color}"></div>
        <span class="legend__emoji">${layer.emoji}</span>
        <span class="legend__label">${layer.label}</span>
        <div class="legend__active-dot"></div>
      </div>
    `).join('');

    const severityHTML = SEVERITY.map(s => `
      <div class="legend__sev-item">
        <div class="legend__sev-dot" style="background:${s.color}"></div>
        <span class="legend__sev-label">${s.label}</span>
      </div>
    `).join('');

    return `
      ${rowsHTML}
      <div class="legend__divider"></div>
      <div class="legend__severity">${severityHTML}</div>
    `;
  }

  // ─── Click listeners ─────────────────────────────────────────────────────────

  private attachListeners(): void {
    // Use event delegation — one listener on the container handles all rows.
    // This is more efficient than attaching a listener to each row individually.
    this.el.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.legend__row');
      if (!row || !row.dataset['layer']) return;

      const layerId = row.dataset['layer'];
      const wasVisible = this.visibility.get(layerId) ?? true;
      const nowVisible = !wasVisible;

      // Update internal state
      this.visibility.set(layerId, nowVisible);

      // Update visual state — toggle the --off modifier class
      row.classList.toggle('legend__row--off', !nowVisible);

      // Fire the event that MapView listens for
      window.dispatchEvent(new CustomEvent('legend:toggle', {
        detail: { layer: layerId, visible: nowVisible },
      }));
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get the current visibility state of all layers.
   * MapView can call this on init to sync its initial state.
   */
  getVisibility(): Map<string, boolean> {
    return new Map(this.visibility);
  }
}
