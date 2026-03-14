/**
 * PulseMap — Sidebar component.
 *
 * A 340px right panel showing:
 *   1. Risk Score Card    — gauge injected by RiskScoreCard component
 *   2. Source Breakdown   — per-source component bars
 *   3. Anomaly Alerts     — collapsible list of detected anomalies
 *   4. Data Sources       — freshness indicator per data source
 *
 * The component is purely display-only; it exposes an update() method that
 * main.ts calls whenever new data arrives.
 */

import type { CommunityHealthScore } from '@/types/index.js';
import { scoreColor, severityColor, timeAgo } from '@/utils/formatters.js';

// ─── Source metadata ──────────────────────────────────────────────────────────

const DATA_SOURCES = [
  'CDC Wastewater',
  'CDC FluView',
  'EPA AirNow',
  'WHO Outbreaks',
  'CMS Hospitals',
  'NWS Alerts',
] as const;

const COMPONENT_LABELS: Record<string, string> = {
  wastewater:       'Wastewater',
  fluActivity:      'Flu Activity',
  airQuality:       'Air Quality',
  hospitalCapacity: 'Hospitals',
  outbreakAlerts:   'Outbreaks',
  wildfireRisk:     'Wildfires',
  heatAlerts:       'Heat Alerts',
  pollenIndex:      'Pollen',
  uvIndex:          'UV Index',
};

// ─── Component class ──────────────────────────────────────────────────────────

export class Sidebar {
  private container: HTMLElement;
  private componentBarsEl: HTMLDivElement;
  private alertListEl: HTMLDivElement;
  private sourceListEl: HTMLDivElement;

  constructor(mountPoint: HTMLElement) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;top:0;right:0;width:340px;height:100vh;' +
      'background:#0d1321;border-left:1px solid #1e2d4a;z-index:50;' +
      'overflow-y:auto;display:flex;flex-direction:column;' +
      'font-family:system-ui,sans-serif;';

    // ── a. Risk Score Card slot ────────────────────────────────────────────
    const riskCardSlot = document.createElement('div');
    riskCardSlot.id = 'risk-score-card';

    // ── b. Sitrep Card slot ────────────────────────────────────────────────
    const sitrepCardSlot = document.createElement('div');
    sitrepCardSlot.id = 'sitrep-card';

    // ── c. Source Breakdown ────────────────────────────────────────────────
    const breakdownSection = this.buildSection('Source Breakdown');
    this.componentBarsEl = document.createElement('div');
    this.componentBarsEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    breakdownSection.appendChild(this.componentBarsEl);

    // ── c. Anomaly Alerts (collapsible, default collapsed) ─────────────────
    const alertSection = document.createElement('div');
    alertSection.style.cssText = 'padding:20px;border-bottom:1px solid #1e2d4a;';

    const alertHeader = document.createElement('div');
    alertHeader.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;cursor:pointer;';

    const alertTitleEl = document.createElement('div');
    alertTitleEl.style.cssText =
      'color:#8892a4;font-size:11px;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:0.1em;';
    alertTitleEl.textContent = 'ANOMALY ALERTS';

    const alertChevron = document.createElement('span');
    alertChevron.style.cssText = 'color:#8892a4;font-size:11px;transition:transform 0.2s;';
    alertChevron.textContent = '▼';
    alertChevron.style.transform = 'rotate(-90deg)';

    alertHeader.appendChild(alertTitleEl);
    alertHeader.appendChild(alertChevron);
    alertSection.appendChild(alertHeader);

    this.alertListEl = document.createElement('div');
    this.alertListEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:16px;';
    this.alertListEl.innerHTML =
      '<div style="color:#8892a4;font-size:13px;">No anomalies detected yet.</div>';
    this.alertListEl.style.display = 'none'; // collapsed by default

    alertHeader.addEventListener('click', () => {
      const isExpanded = this.alertListEl.style.display !== 'none';
      this.alertListEl.style.display = isExpanded ? 'none' : 'flex';
      alertChevron.style.transform = isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    alertSection.appendChild(this.alertListEl);

    // ── d. Data Sources ────────────────────────────────────────────────────
    const sourceSection = this.buildSection('Data Sources');
    this.sourceListEl = document.createElement('div');
    this.sourceListEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    for (const source of DATA_SOURCES) {
      this.sourceListEl.appendChild(this.buildSourceRow(source, null));
    }
    sourceSection.appendChild(this.sourceListEl);

    this.container.appendChild(riskCardSlot);
    this.container.appendChild(sitrepCardSlot);
    this.container.appendChild(breakdownSection);
    this.container.appendChild(alertSection);
    this.container.appendChild(sourceSection);
    mountPoint.appendChild(this.container);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding:20px;border-bottom:1px solid #1e2d4a;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText =
      'color:#8892a4;font-size:11px;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:0.1em;margin-bottom:16px;';
    titleEl.textContent = title;
    section.appendChild(titleEl);

    return section;
  }

  private buildSourceRow(name: string, timestamp: string | null): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.dataset['source'] = name;

    const dot = document.createElement('span');
    dot.style.cssText =
      'width:8px;height:8px;border-radius:50%;flex-shrink:0;' +
      `background:${timestamp ? '#22c55e' : '#8892a4'};`;

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'flex:1;font-size:13px;color:#fff;';
    nameEl.textContent = name;

    const timeEl = document.createElement('span');
    timeEl.style.cssText = 'font-size:11px;color:#8892a4;';
    timeEl.textContent = timestamp ? timeAgo(timestamp) : 'Pending';

    row.appendChild(dot);
    row.appendChild(nameEl);
    row.appendChild(timeEl);
    return row;
  }

  private buildComponentBar(
    key: string,
    value: number,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const label = document.createElement('span');
    label.style.cssText = 'color:#8892a4;font-size:12px;width:120px;flex-shrink:0;';
    label.textContent = COMPONENT_LABELS[key] ?? key;

    const track = document.createElement('div');
    track.style.cssText =
      'flex:1;height:4px;background:#1e2d4a;border-radius:2px;overflow:hidden;';

    const fill = document.createElement('div');
    fill.style.cssText =
      `height:100%;border-radius:2px;width:${value}%;` +
      `background:${scoreColor(value)};transition:width 0.5s ease;`;
    track.appendChild(fill);

    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'color:#8892a4;font-size:11px;width:28px;text-align:right;';
    valueEl.textContent = String(value);

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(valueEl);
    return row;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Re-renders the sidebar with new health score data.
   * Called by main.ts whenever the score is recalculated.
   */
  update(score: CommunityHealthScore): void {
    // Rebuild component bars
    this.componentBarsEl.innerHTML = '';
    for (const [key, value] of Object.entries(score.components)) {
      this.componentBarsEl.appendChild(this.buildComponentBar(key, value));
    }

    // Rebuild anomaly list
    this.alertListEl.innerHTML = '';
    if (score.anomalies.length === 0) {
      const noAlerts = document.createElement('div');
      noAlerts.style.cssText = 'color:#8892a4;font-size:13px;';
      noAlerts.textContent = 'No anomalies detected.';
      this.alertListEl.appendChild(noAlerts);
    } else {
      for (const anomaly of score.anomalies) {
        const item = document.createElement('div');
        const borderColor = severityColor(anomaly.severity);
        item.style.cssText =
          `padding:10px 12px;border-radius:6px;border-left:3px solid ${borderColor};` +
          `background:${borderColor}18;`;

        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:13px;color:#fff;line-height:1.4;';
        msg.textContent = anomaly.message;

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:11px;color:#8892a4;margin-top:4px;';
        meta.textContent = `z-score: ${anomaly.zScore.toFixed(2)} · ${anomaly.severity}`;

        item.appendChild(msg);
        item.appendChild(meta);
        this.alertListEl.appendChild(item);
      }
    }
  }

  /**
   * Updates the freshness timestamps in the Data Sources section.
   *
   * @param freshness - Map from source name to last successful fetch ISO timestamp
   */
  updateSourceFreshness(freshness: Map<string, string>): void {
    this.sourceListEl.innerHTML = '';
    for (const source of DATA_SOURCES) {
      const ts = freshness.get(source) ?? null;
      this.sourceListEl.appendChild(this.buildSourceRow(source, ts));
    }
  }
}
