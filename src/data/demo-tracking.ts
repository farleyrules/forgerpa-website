/**
 * Tracked demo links (David, 2026-10-30).
 *
 * The sales cockpit (forgerpa-sales, sales.forgerpa.com) mints a link per prospect:
 * https://forgerpa.com/demos/<slug>/?r=<token>. When a /demos/<slug>/ page opens with a valid
 * `r`, src/components/DemoTracking.astro beacons a small, fixed set of events to the cockpit,
 * which shows them on that lead. A page without `r` (every anonymous visitor) sends nothing.
 *
 * The cockpit owns the contract (forgerpa-sales lib/demo-links/events.ts); the values below
 * mirror it and must change together with it.
 */

/** The cockpit's public event ingest. */
export const DEMO_EVENTS_URL = 'https://sales.forgerpa.com/api/demo-links/watch';

/** A token is exactly 10 base62 characters (forgerpa-sales lib/demo-links/token.ts). */
export const DEMO_TOKEN_PATTERN = '^[A-Za-z0-9]{10}$';

/** How often a playing video reports progress, in milliseconds. */
export const DEMO_HEARTBEAT_MS = 10_000;
