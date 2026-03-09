/**
 * PulseMap — AlertBanner component.
 *
 * A full-width banner that slides down from the top of the screen when a
 * critical alert is raised (e.g. a 'critical' anomaly or a WHO outbreak in
 * the user's selected region).
 *
 * Hidden by default.  Exposes show(message) / hide() for programmatic control.
 */

export class AlertBanner {
  private container: HTMLElement;
  private messageEl: HTMLSpanElement;

  constructor(mountPoint: HTMLElement) {
    this.container = document.createElement('div');
    this.container.role = 'alert';
    this.container.setAttribute('aria-live', 'assertive');
    this.container.style.cssText =
      'position:fixed;top:0;left:0;right:340px;z-index:200;' +
      'background:#7c1111;border-bottom:1px solid #ef4444;' +
      'padding:12px 20px;display:flex;align-items:center;gap:12px;' +
      'transform:translateY(-100%);transition:transform 0.3s ease;' +
      'font-family:system-ui,sans-serif;';

    // Alert icon
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:18px;flex-shrink:0;';
    icon.textContent = '!';
    icon.style.cssText =
      'width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.2);' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:13px;font-weight:700;color:#fff;flex-shrink:0;';

    this.messageEl = document.createElement('span');
    this.messageEl.style.cssText =
      'flex:1;color:#fff;font-size:14px;font-weight:500;';

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss alert');
    dismissBtn.style.cssText =
      'background:none;border:1px solid rgba(255,255,255,0.3);border-radius:4px;' +
      'padding:4px 10px;color:#fff;font-size:12px;cursor:pointer;' +
      'font-family:system-ui,sans-serif;transition:background 0.15s;';
    dismissBtn.addEventListener('mouseenter', () => {
      dismissBtn.style.background = 'rgba(255,255,255,0.1)';
    });
    dismissBtn.addEventListener('mouseleave', () => {
      dismissBtn.style.background = 'none';
    });
    dismissBtn.addEventListener('click', () => this.hide());

    this.container.appendChild(icon);
    this.container.appendChild(this.messageEl);
    this.container.appendChild(dismissBtn);
    mountPoint.appendChild(this.container);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Slides the banner into view with the given message.
   * Safe to call multiple times — subsequent calls update the message.
   */
  show(message: string): void {
    this.messageEl.textContent = message;
    this.container.style.transform = 'translateY(0)';
  }

  /** Slides the banner back out of view. */
  hide(): void {
    this.container.style.transform = 'translateY(-100%)';
  }
}
