/**
 * Tracked demo links (David, 2026-10-30).
 *
 * The sales cockpit (forgerpa-sales, sales.forgerpa.com) mints a link per prospect:
 * https://forgerpa.com/demos/<slug>/?r=<token>, or, for a video made for one prospect,
 * https://forgerpa.com/demos/watch/?r=<token>. When either page opens with a valid `r`,
 * src/components/DemoTracking.astro beacons a small, fixed set of events to the cockpit,
 * which shows them on that lead. A page without `r` (every anonymous visitor) sends nothing.
 *
 * The cockpit owns the contract (forgerpa-sales lib/demo-links/events.ts); the values below
 * mirror it and must change together with it.
 */

/** The cockpit's public event ingest. */
export const DEMO_EVENTS_URL = 'https://sales.forgerpa.com/api/demo-links/watch';

/**
 * The cockpit's private-link lookup, read by /demos/watch/ (src/pages/demos/watch.astro).
 *
 * A video made for one prospect is never committed to this public repo: its title, poster and
 * file live in the cockpit, and its link is https://forgerpa.com/demos/watch/?r=<token>. The page
 * asks GET <this>?r=<token>, which answers 200 with { version: 1, slug, title, audience,
 * description, durationSeconds, videoUrl, posterUrl } for a live private link, and 404
 * { error: "not found" } for anything else (malformed, unknown, revoked or a public video's
 * token alike). It records nothing; views still come only from the beacons sent to
 * DEMO_EVENTS_URL, with the slug this lookup returned.
 */
export const DEMO_RESOLVE_URL = 'https://sales.forgerpa.com/api/demo-links/resolve';

/** A token is exactly 10 base62 characters (forgerpa-sales lib/demo-links/token.ts). */
export const DEMO_TOKEN_PATTERN = '^[A-Za-z0-9]{10}$';

/** How often a playing video reports progress, in milliseconds. */
export const DEMO_HEARTBEAT_MS = 10_000;
