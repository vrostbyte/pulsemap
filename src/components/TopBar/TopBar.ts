// src/components/TopBar/TopBar.ts
//
// War room top bar — fixed across the top of the map (not the sidebar).
//
// LAYOUT (left → right):
//   [PulseMap wordmark] · [5 world clocks] · [● STATUS] [↻ Xm ago]
//
// WORLD CLOCKS:
//   San Diego · New York · London (UTC) · Geneva/WHO · Beijing
//   Left-to-right geographic sweep matching a world map.
//   London and Geneva share UTC+0/+1 — Geneva is labeled "Geneva/WHO"
//   to honor the WHO HQ connection without burning a separate column.
//
// STATUS PILL:
//   Dot pulses at 2s normally, 0.8s when HIGH or CRITICAL.
//   Only the dot pulses — text stays static.
//
// FRESHNESS:
//   "↻ updated Xm ago" — updates every 60s client-side.
//   lastUpdated is set by calling topbar.setUpdated() after each data fetch.

import './TopBar.css';

// ─── Clock config ─────────────────────────────────────────────────────────────
// Each entry: display label + IANA timezone string.
// IANA timezones are the standard cross-browser way to get a city's local time.

const CLOCKS = [
  { city: 'San Diego',   tz: 'America/Los_Angeles' },
  { city: 'New York',    tz: 'America/New_York'     },
  { city: 'London',      tz: 'Europe/London'        },
  { city: 'Geneva / WHO',tz: 'Europe/Zurich'        },
  { city: 'Beijing',     tz: 'Asia/Shanghai'        },
] as const;

// ─── Status color palette ─────────────────────────────────────────────────────
// Must match RiskScore.ts thresholds exactly.

const STATUS_STYLES: Record<string, { color: string; label: string; fast: boolean }> = {
  LOW:      { color: '#00e676', label: 'LOW',      fast: false },
  MODERATE: { color: '#ffcc02', label: 'MODERATE', fast: false },
  HIGH:     { color: '#ff6d00', label: 'HIGH',     fast: true  },
  CRITICAL: { color: '#ff1744', label: 'CRITICAL', fast: true  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export class TopBar {
  private bar: HTMLElement;
  private clockEls: HTMLElement[]  = [];
  private statusDot: HTMLElement   | null = null;
  private statusLabel: HTMLElement | null = null;
  private freshnessEl: HTMLElement | null = null;

  private lastUpdated: Date | null = null;
  private tickInterval: number     | null = null;
  private freshnessInterval: number| null = null;

  constructor(mountPoint: HTMLElement) {
    this.bar = document.createElement('div');
    this.bar.className = 'topbar';
    this.bar.innerHTML = this.buildHTML();
    mountPoint.appendChild(this.bar);

    // Cache the clock time elements for fast updates
    this.clockEls = Array.from(this.bar.querySelectorAll<HTMLElement>('.topbar__clock-time'));
    this.statusDot   = this.bar.querySelector('.topbar__status-dot');
    this.statusLabel = this.bar.querySelector('.topbar__status-label');
    this.freshnessEl = this.bar.querySelector('.topbar__freshness');

    // Start the clock ticker — updates every second
    this.startClocks();

    // Update freshness text every 60 seconds
    this.freshnessInterval = window.setInterval(() => this.renderFreshness(), 60_000);
  }

  // ─── HTML template ───────────────────────────────────────────────────────────

  private buildHTML(): string {
    const clocksHTML = CLOCKS.map(({ city }) => `
      <div class="topbar__clock">
        <span class="topbar__clock-city">${city}</span>
        <span class="topbar__clock-time">--:--</span>
      </div>
    `).join('');

    return `
      <div class="topbar__wordmark">Pulse<span>Map</span></div>

      <div class="topbar__clocks">
        ${clocksHTML}
      </div>

      <div class="topbar__right">
        <div class="topbar__status">
          <div class="topbar__status-dot"></div>
          <span class="topbar__status-label">—</span>
        </div>
        <span class="topbar__freshness">↻ waiting for data</span>
      </div>
    `;
  }

  // ─── Clock tick ──────────────────────────────────────────────────────────────
  // Runs every second. Formats each timezone's current time as "9:14a" / "12:14p".
  // Highlights the clock matching the user's local timezone (best-effort).

  private startClocks(): void {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const tick = (): void => {
      const now = new Date();
      CLOCKS.forEach(({ tz }, i) => {
        const el = this.clockEls[i];
        if (!el) return;

        // Format time in this timezone
        const time = now.toLocaleTimeString('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        // "12:14 PM" → "12:14p"  (compact war-room style)
        .replace(' AM', 'a').replace(' PM', 'p');

        el.textContent = time;

        // Highlight if this clock matches the user's local timezone
        el.classList.toggle('topbar__clock-time--active', tz === userTz);
      });
    };

    tick(); // Run immediately so there's no blank flash on load
    this.tickInterval = window.setInterval(tick, 1_000);
  }

  // ─── Freshness ───────────────────────────────────────────────────────────────

  private renderFreshness(): void {
    if (!this.freshnessEl) return;
    if (!this.lastUpdated) {
      this.freshnessEl.textContent = '↻ waiting for data';
      return;
    }
    const mins = Math.floor((Date.now() - this.lastUpdated.getTime()) / 60_000);
    this.freshnessEl.textContent = mins < 1
      ? '↻ just updated'
      : `↻ updated ${mins}m ago`;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Call this after each successful data fetch to reset the freshness timer.
   */
  setUpdated(): void {
    this.lastUpdated = new Date();
    this.renderFreshness();
  }

  /**
   * Update the status pill to reflect the current global risk level.
   * @param score  0–100 risk index (same value fed to RiskScoreCard)
   */
  setStatus(score: number): void {
    let key: string;
    if (score < 25)      key = 'LOW';
    else if (score < 50) key = 'MODERATE';
    else if (score < 75) key = 'HIGH';
    else                 key = 'CRITICAL';

    const style = STATUS_STYLES[key];
    if (!style) return;

    if (this.statusDot) {
      this.statusDot.style.background = style.color;
      // Swap pulse speed class
      this.statusDot.classList.toggle('topbar__status-dot--fast', style.fast);
    }

    if (this.statusLabel) {
      this.statusLabel.textContent  = style.label;
      this.statusLabel.style.color  = style.color;
    }
  }

  /**
   * Clean up intervals if the component is ever destroyed.
   */
  destroy(): void {
    if (this.tickInterval)       clearInterval(this.tickInterval);
    if (this.freshnessInterval)  clearInterval(this.freshnessInterval);
  }
}
