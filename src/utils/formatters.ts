/**
 * PulseMap — Formatting utilities.
 *
 * Pure functions for converting raw values to human-readable strings used
 * throughout the UI.  No side effects, no imports from the rest of the app.
 */

import type { HealthSignal } from '@/types/index.js';

// ─── Date / time ──────────────────────────────────────────────────────────────

/**
 * Returns a relative time string like "3 min ago", "2 hr ago", "5 days ago".
 * Falls back to the ISO string if the date is invalid.
 */
export function timeAgo(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/**
 * Formats an ISO timestamp to a short local date/time string.
 * e.g. "Dec 12, 3:45 PM"
 */
export function shortDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── AQI ──────────────────────────────────────────────────────────────────────

/** EPA AQI category label from a numeric AQI value. */
export function aqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * Returns a CSS hex colour string for a given AQI value.
 * Matches the official EPA AQI colour scheme.
 */
export function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#22c55e';   // green — Good
  if (aqi <= 100) return '#f59e0b';  // yellow — Moderate
  if (aqi <= 150) return '#f97316';  // orange — USG
  if (aqi <= 200) return '#ef4444';  // red — Unhealthy
  if (aqi <= 300) return '#7c3aed';  // purple — Very Unhealthy
  return '#7f1d1d';                  // maroon — Hazardous
}

// ─── Severity ─────────────────────────────────────────────────────────────────

/** Maps a severity string to a CSS hex colour. */
export function severityColor(severity: HealthSignal['severity']): string {
  switch (severity) {
    case 'low': return '#22c55e';
    case 'medium': return '#f59e0b';
    case 'high': return '#ef4444';
    case 'critical': return '#7c3aed';
  }
}

/** Maps a severity string to a short emoji-free label. */
export function severityLabel(severity: HealthSignal['severity']): string {
  switch (severity) {
    case 'low': return 'Low';
    case 'medium': return 'Moderate';
    case 'high': return 'High';
    case 'critical': return 'Critical';
  }
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

/** Compact number formatter: 1234 → "1.2K", 1234567 → "1.2M". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * Clamps a value to [0, 100] and rounds to the nearest integer.
 * Used to keep normalised scores within the display range.
 */
export function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

// ─── Health score labels ──────────────────────────────────────────────────────

/** Maps a 0–100 composite health score to a colour hex string. */
export function scoreColor(score: number): string {
  if (score <= 20) return '#22c55e';  // Good
  if (score <= 40) return '#84cc16';  // Moderate
  if (score <= 60) return '#f59e0b';  // Elevated
  if (score <= 80) return '#ef4444';  // High
  return '#7c3aed';                   // Critical
}

/** Maps a 0–100 composite health score to its label tier. */
export function scoreLabel(score: number): string {
  if (score <= 20) return 'Good';
  if (score <= 40) return 'Moderate';
  if (score <= 60) return 'Elevated';
  if (score <= 80) return 'High';
  return 'Critical';
}
