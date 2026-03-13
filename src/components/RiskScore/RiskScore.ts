// src/components/RiskScore/RiskScore.ts
//
// The Community Risk Score hero card.
// Displays a semicircular gauge with animated score, color-coded risk label,
// and scope indicator (global vs local ZIP).
//
// HOW IT WORKS:
//   1. buildHTML() injects the SVG + markup into a container element
//   2. After render, getTotalLength() measures the exact arc pixel length
//   3. update(score) animates from current score to new score over 800ms
//   4. The arc fill uses stroke-dasharray — "filled_px total_px"
//      At score=0: "0 251"  (empty arc)
//      At score=50: "125 251" (half filled)
//      At score=100: "251 251" (fully filled)

import './RiskScore.css';

// ─── Risk level thresholds ────────────────────────────────────────────────────
// Each threshold maps a score range to a label, arc color, and glow color.

interface RiskLevel {
  label: string;
  color: string;
  glow: string;
}

function getRiskLevel(score: number): RiskLevel {
  if (score < 25) return { label: 'LOW',      color: '#00e676', glow: 'rgba(0,230,118,0.35)' };
  if (score < 50) return { label: 'MODERATE', color: '#ffcc02', glow: 'rgba(255,204,2,0.35)'  };
  if (score < 75) return { label: 'HIGH',     color: '#ff6d00', glow: 'rgba(255,109,0,0.35)'  };
  return            { label: 'CRITICAL',      color: '#ff1744', glow: 'rgba(255,23,68,0.35)'  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export class RiskScoreCard {
  private el: HTMLElement;
  private arcFill: SVGPathElement | null = null;
  private arcLength = 0;
  private currentScore = 0;
  private animFrame: number | null = null;

  /**
   * @param containerId  The id of the HTML element to render into.
   *                     Example: 'risk-score-card'
   */
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`RiskScoreCard: no element found with id "${containerId}"`);
    }
    this.el = container;
    this.el.innerHTML = this.buildHTML();

    // Grab the fill arc and measure its total path length.
    // getTotalLength() is a native SVG method — it returns the exact pixel
    // length of the path so we can calculate how much to fill for any score.
    this.arcFill = this.el.querySelector('.gauge-fill');
    if (this.arcFill) {
      this.arcLength = this.arcFill.getTotalLength();
      // Start empty
      this.arcFill.style.strokeDasharray = `0 ${this.arcLength}`;
    }
  }

  // ─── HTML / SVG template ───────────────────────────────────────────────────
  // The semicircle arc path: M 20,110 A 90,90 0 0,1 200,110
  //   M 20,110       — start at left endpoint
  //   A 90,90        — arc with x-radius=90, y-radius=90 (circle)
  //   0 0,1          — x-rotation=0, large-arc=0, sweep=1 (clockwise)
  //   200,110        — end at right endpoint
  // Center of this arc is at (110, 110). Top of arc is at (110, 20).

  private buildHTML(): string {
    return `
      <div class="risk-card">
        <span class="risk-card__eyebrow">COMMUNITY RISK SCORE</span>
        <div class="risk-card__gauge-wrap">
          <svg class="risk-gauge" viewBox="0 0 220 132" xmlns="http://www.w3.org/2000/svg">

            <!-- Background arc (dark track) -->
            <path class="gauge-track"
              d="M 20,110 A 90,90 0 0,1 200,110"
              fill="none"
              stroke="#1e2d42"
              stroke-width="13"
              stroke-linecap="round"/>

            <!-- Colored fill arc — stroke-dasharray controls how much is filled -->
            <path class="gauge-fill"
              d="M 20,110 A 90,90 0 0,1 200,110"
              fill="none"
              stroke="#00e676"
              stroke-width="13"
              stroke-linecap="round"/>

            <!-- Scale endpoint labels -->
            <text class="gauge-label" x="12" y="128">0</text>
            <text class="gauge-label" x="208" y="128" text-anchor="end">100</text>

            <!-- Large score number — sits in the upper bowl of the arc -->
            <text class="gauge-score" x="110" y="92" text-anchor="middle">0</text>

            <!-- Risk label — sits just below the score number -->
            <text class="gauge-risk-label" x="110" y="112" text-anchor="middle">—</text>

          </svg>
        </div>
        <div class="risk-card__scope">
          <span class="risk-card__scope-icon">🌍</span>
          <span class="risk-card__scope-text">Global average — enter ZIP for local</span>
        </div>
      </div>
    `;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Update the displayed score. Animates smoothly from current → target.
   *
   * @param score    0–100 risk index
   * @param isLocal  true = show "Local risk score", false = show "Global average"
   */
  update(score: number, isLocal = false): void {
    const target = Math.max(0, Math.min(100, Math.round(score)));

    // Cancel any in-progress animation before starting a new one
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    this.animateTo(target, isLocal);
  }

  // ─── Internal animation ────────────────────────────────────────────────────

  private animateTo(target: number, isLocal: boolean): void {
    const startScore = this.currentScore;
    const duration  = 800; // milliseconds for the animation
    const startTime = performance.now();
    const risk      = getRiskLevel(target);

    // Update colors and labels immediately (don't wait for animation)
    this.applyRiskStyle(risk, isLocal);

    const tick = (now: number): void => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic — starts fast, decelerates into the final value
      const eased   = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startScore + (target - startScore) * eased);

      this.currentScore = current;
      this.applyScore(current);

      if (progress < 1) {
        this.animFrame = requestAnimationFrame(tick);
      } else {
        this.animFrame = null;
      }
    };

    this.animFrame = requestAnimationFrame(tick);
  }

  // Writes the numeric score and arc fill position to the DOM
  private applyScore(score: number): void {
    const scoreEl = this.el.querySelector('.gauge-score');
    if (scoreEl) (scoreEl as SVGTextElement).textContent = String(score);

    if (this.arcFill && this.arcLength > 0) {
      const filled = (score / 100) * this.arcLength;
      this.arcFill.style.strokeDasharray = `${filled} ${this.arcLength}`;
    }
  }

  // Writes risk color, glow, label, and scope text to the DOM
  private applyRiskStyle(risk: RiskLevel, isLocal: boolean): void {
    if (this.arcFill) {
      this.arcFill.style.stroke  = risk.color;
      this.arcFill.style.filter  = `drop-shadow(0 0 7px ${risk.glow})`;
    }

    const labelEl = this.el.querySelector('.gauge-risk-label');
    if (labelEl) {
      (labelEl as SVGTextElement).textContent = risk.label;
      (labelEl as SVGTextElement).style.fill  = risk.color;
    }

    const scopeIcon = this.el.querySelector('.risk-card__scope-icon');
    const scopeText = this.el.querySelector('.risk-card__scope-text');
    if (scopeIcon) (scopeIcon as HTMLElement).textContent = isLocal ? '📍' : '🌍';
    if (scopeText) {
      (scopeText as HTMLElement).textContent = isLocal
        ? 'Local risk score'
        : 'Global average — enter ZIP for local';
    }
  }
}
