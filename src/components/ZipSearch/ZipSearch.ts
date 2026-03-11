/**
 * PulseMap — ZipSearch component.
 *
 * A small floating search bar in the top-left corner of the map.
 * Accepts a 5-digit US ZIP code, resolves it via zipToFips(), then
 * dispatches a 'search:zip' CustomEvent so main.ts can fly the map
 * and update the health score for that county.
 *
 * Custom events dispatched:
 *   'search:zip'  — { detail: { zip, fips, lat, lng, countyName, state } }
 */

import { zipToFips, ZipNotFoundError } from '@/geo/zipToFips.js';
import { logger } from '@/utils/logger.js';

export interface ZipSearchEventDetail {
  zip: string;
  fips: string;
  lat: number;
  lng: number;
  countyName: string;
  state: string;
}

export class ZipSearch {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private errorEl: HTMLDivElement;

  constructor(mountPoint: HTMLElement) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;top:16px;left:16px;z-index:100;display:flex;flex-direction:column;gap:6px;width:220px;';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:6px;';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 5;
    this.input.placeholder = 'ZIP code';
    this.input.setAttribute('aria-label', 'Enter ZIP code');
    this.input.style.cssText =
      'flex:1;background:rgba(10,15,26,0.85);border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:8px;padding:8px 12px;color:#fff;font-size:14px;' +
      'font-family:system-ui,sans-serif;outline:none;backdrop-filter:blur(10px);' +
      'transition:border-color 0.15s;width:100%;';
    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = '#00d4ff';
    });
    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = 'rgba(255,255,255,0.1)';
    });
    // Allow pressing Enter to submit
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.handleSearch();
    });

    this.button = document.createElement('button');
    this.button.textContent = 'Go';
    this.button.setAttribute('aria-label', 'Search ZIP code');
    this.button.style.cssText =
      'background:#00d4ff;border:none;border-radius:8px;padding:8px 14px;' +
      'color:#0a0f1a;font-size:14px;font-weight:600;cursor:pointer;' +
      'font-family:system-ui,sans-serif;transition:background 0.15s,opacity 0.15s;' +
      'white-space:nowrap;';
    this.button.addEventListener('click', () => void this.handleSearch());

    this.errorEl = document.createElement('div');
    this.errorEl.style.cssText =
      'display:none;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);' +
      'border-radius:6px;padding:6px 10px;color:#fca5a5;font-size:12px;' +
      'font-family:system-ui,sans-serif;';

    inputRow.appendChild(this.input);
    inputRow.appendChild(this.button);
    this.container.appendChild(inputRow);
    this.container.appendChild(this.errorEl);
    mountPoint.appendChild(this.container);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private setLoading(loading: boolean): void {
    this.button.disabled = loading;
    this.button.textContent = loading ? '…' : 'Go';
    this.input.disabled = loading;
  }

  private showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.style.display = 'block';
  }

  private clearError(): void {
    this.errorEl.style.display = 'none';
    this.errorEl.textContent = '';
  }

  private async handleSearch(): Promise<void> {
    const zip = this.input.value.trim();
    this.clearError();

    if (!/^\d{5}$/.test(zip)) {
      this.showError('Enter a valid 5-digit ZIP code.');
      return;
    }

    this.setLoading(true);

    try {
      const result = await zipToFips(zip);

      const detail: ZipSearchEventDetail = {
        zip,
        fips: result.fips,
        lat: result.lat,
        lng: result.lng,
        countyName: result.countyName,
        state: result.state,
      };

      document.dispatchEvent(
        new CustomEvent<ZipSearchEventDetail>('search:zip', { detail }),
      );

      logger.info('ZipSearch: dispatched search:zip', detail);
    } catch (err) {
      if (err instanceof ZipNotFoundError) {
        this.showError(`ZIP ${zip} not found. Try another.`);
      } else {
        this.showError('Network error. Please try again.');
        logger.error('ZipSearch: lookup failed', err);
      }
    } finally {
      this.setLoading(false);
    }
  }
}
