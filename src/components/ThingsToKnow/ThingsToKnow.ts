// src/components/ThingsToKnow/ThingsToKnow.ts
//
// "Situation Report" card — always shows exactly 3 briefing items.
//
// HOW IT WORKS:
//   1. Takes anomalies (bad signals) and positive fills (calm signals)
//   2. Ranks anomalies by z-score descending, takes top 3
//   3. If fewer than 3 anomalies, fills remaining slots with positive signals
//   4. Each item has: severity badge, plain-English headline, context line, zoom button
//   5. Zoom button fires a custom 'sitrep:zoom' event with { lat, lng }
//      MapView listens for this event and flies the camera to that location
//
// HEADLINE TEMPLATE:
//   [data type] [direction] in [location]
//   e.g. "Wastewater rising in Maricopa County"
//        "Air quality deteriorating — Dallas area"
//        "Flu activity elevated — Southeast region"

import './ThingsToKnow.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SitrepAnomaly {
  /** Human-readable source name, e.g. "Wastewater", "Flu Activity" */
  source: string;
  /** Direction word — "rising", "elevated", "deteriorating", "spiking" */
  direction: string;
  /** Location string — county, metro, region name */
  location: string;
  /** e.g. "2.8× above 90-day average" */
  context: string;
  /** 0–100 severity score, used to pick badge color */
  severity: number;
  /** lat/lng for the zoom button — undefined for positive fill items */
  lat?: number;
  lng?: number;
}

/** A positive fill item shown when fewer than 3 anomalies exist */
export interface SitrepPositive {
  source: string;
  headline: string;
  context: string;
}

// ─── Badge color ──────────────────────────────────────────────────────────────
// Maps severity 0-100 to the same palette as the risk gauge

function badgeColor(severity: number): string {
  if (severity < 25) return '#00e676'; // green  — low
  if (severity < 50) return '#ffcc02'; // yellow — moderate
  if (severity < 75) return '#ff6d00'; // orange — high
  return '#ff1744';                    // red    — critical
}

// ─── Headline builder ─────────────────────────────────────────────────────────
// Keeps raw numbers out of the headline — those go in the context line only.

function buildHeadline(anomaly: SitrepAnomaly): string {
  return `${anomaly.source} ${anomaly.direction} — ${anomaly.location}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export class ThingsToKnow {
  private el: HTMLElement;

  /**
   * @param containerId  ID of the element to render into, e.g. 'sitrep-card'
   */
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`ThingsToKnow: no element found with id "${containerId}"`);
    }
    this.el = container;
    this.renderEmpty();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render exactly 3 briefing items.
   * Fill remaining slots with positive signals if anomalies.length < 3.
   *
   * @param anomalies  Ranked anomalies (pass all — we take top 3 internally)
   * @param positives  Positive fill items for calm days
   */
  update(anomalies: SitrepAnomaly[], positives: SitrepPositive[]): void {
    // Sort by severity descending, take top 3
    const ranked = [...anomalies]
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 3);

    // Fill remaining slots with positive signals
    const items: Array<{ type: 'anomaly'; data: SitrepAnomaly } | { type: 'positive'; data: SitrepPositive }> = [
      ...ranked.map(a => ({ type: 'anomaly' as const, data: a })),
      ...positives.slice(0, 3 - ranked.length).map(p => ({ type: 'positive' as const, data: p })),
    ];

    this.el.innerHTML = '';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'sitrep__eyebrow';
    eyebrow.textContent = 'SITUATION REPORT';
    this.el.appendChild(eyebrow);

    const list = document.createElement('div');
    list.className = 'sitrep';

    for (const item of items) {
      if (item.type === 'anomaly') {
        list.appendChild(this.buildAnomalyItem(item.data));
      } else {
        list.appendChild(this.buildPositiveItem(item.data));
      }
    }

    this.el.appendChild(list);
  }

  // ─── Private builders ────────────────────────────────────────────────────────

  private buildAnomalyItem(anomaly: SitrepAnomaly): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'sitrep__item';

    // Colored severity dot
    const badge = document.createElement('div');
    badge.className = 'sitrep__badge';
    badge.style.background = badgeColor(anomaly.severity);

    // Plain English headline
    const headline = document.createElement('div');
    headline.className = 'sitrep__headline';
    headline.textContent = buildHeadline(anomaly);

    // Context line (numbers go here, not in headline)
    const context = document.createElement('div');
    context.className = 'sitrep__context';
    context.textContent = anomaly.context;

    // Zoom button — fires custom event that MapView listens for
    const zoom = document.createElement('button');
    zoom.className = 'sitrep__zoom';
    zoom.title = 'Zoom to location';
    zoom.textContent = '⊕';

    if (anomaly.lat !== undefined && anomaly.lng !== undefined) {
      const lat = anomaly.lat;
      const lng = anomaly.lng;
      zoom.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('sitrep:zoom', {
          detail: { lat, lng },
        }));
      });
    } else {
      zoom.classList.add('sitrep__zoom--hidden');
    }

    item.appendChild(badge);
    item.appendChild(headline);
    item.appendChild(context);
    item.appendChild(zoom);
    return item;
  }

  private buildPositiveItem(positive: SitrepPositive): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'sitrep__item';

    // Green dot for positive signals
    const badge = document.createElement('div');
    badge.className = 'sitrep__badge';
    badge.style.background = '#00e676';

    const headline = document.createElement('div');
    headline.className = 'sitrep__headline';
    headline.textContent = positive.headline;

    const context = document.createElement('div');
    context.className = 'sitrep__context';
    context.textContent = positive.context;

    // No zoom button for positive fills
    const zoom = document.createElement('button');
    zoom.className = 'sitrep__zoom sitrep__zoom--hidden';

    item.appendChild(badge);
    item.appendChild(headline);
    item.appendChild(context);
    item.appendChild(zoom);
    return item;
  }

  // Shown before data loads
  private renderEmpty(): void {
    this.el.innerHTML = `
      <div class="sitrep__eyebrow">SITUATION REPORT</div>
      <div class="sitrep">
        ${[1,2,3].map(() => `
          <div class="sitrep__item">
            <div class="sitrep__badge" style="background:#1e2d42"></div>
            <div class="sitrep__headline" style="color:#1e2d42">Loading intelligence…</div>
            <div class="sitrep__context"></div>
            <button class="sitrep__zoom sitrep__zoom--hidden">⊕</button>
          </div>
        `).join('')}
      </div>
    `;
  }
}
