import type { CalendarBundle } from '../shared/calendarBundles';

/**
 * Org config — the white-label surface (#org-config). One JSON file per
 * organization lives in config/orgs/; vite.config.ts picks one by the
 * VITE_ORG env var (default: nwsa) and injects it into the bundle as the
 * __ORG_CONFIG__ global, so only the selected org's strings ever ship.
 *
 * Adding a field: extend this interface AND every file in config/orgs/ —
 * there is no partial/default merging, a missing key is a build-time hole.
 */
export interface OrgConfig {
  /** Stable lowercase id ('nwsa', 'asyo') — used in file/UID-ish contexts. */
  orgId: string;
  /** Full app name — "NWSA Music Hub". Sign-in screens, PWA toast, Drive folder. */
  appName: string;
  /** Short brand wordmark — "NWSA Music". Public header, icon labels. */
  brandName: string;
  /** Abbreviation — "NWSA". Spanish copy, alt text, compact labels. */
  orgShortName: string;
  /** The organization's full legal/public name. */
  orgFullName: string;
  /** GitHub Pages base path, with both slashes: '/nwsa-music-hub/'. */
  basePath: string;
  /** Canonical deployed URL (QR posters, welcome banner). */
  publicUrl: string;
  /** publicUrl without scheme, as printed ("type this in") on posters. */
  publicUrlDisplay: string;
  /** IANA timezone for ICS feeds (X-WR-TIMEZONE). */
  timezone: string;
  /** Support/contact email shown in error messages and the Start guide. */
  contactEmail: string;
  /** Logo/mark filenames under public/. */
  logoFile: string;
  markFile: string;
  /**
   * Browser-tab favicon filename under public/ — index.html's <link
   * rel="icon"> href AND type are both rewritten from this (type inferred
   * from the extension in vite.config.ts's orgStatics plugin). NWSA keeps
   * the existing shared 'favicon.svg'; other orgs point at their own file.
   */
  faviconFile: string;
  /**
   * PWA install-prompt / home-screen icon filenames under public/ —
   * public/manifest.json's `icons` entries and index.html's apple-touch-icon
   * link are both rewritten from these (vite.config.ts's orgStatics
   * plugin, by literal filename substring replacement against the NWSA
   * manifest since none of the five filenames overlaps another). NWSA keeps
   * the existing shared files; other orgs point at their own. `maskable192`
   * and `maskable512` must keep their artwork inside the safe-zone circle
   * (content within ~65-70% of the canvas) — Android crops anything
   * outside it, unlike the `icon192`/`icon512` "any"-purpose entries.
   */
  icons: {
    icon192: string;
    icon512: string;
    maskable192: string;
    maskable512: string;
    svg: string;
    appleTouchIcon: string;
  };
  /**
   * Every org-specific file under public/ that belongs to THIS org (logos,
   * printed collateral, campus map). At build time, other orgs' listed
   * assets are pruned from dist so one org's build never ships or precaches
   * another org's files.
   */
  assets: string[];
  /** PWA/browser theme color (index.html meta + manifest). */
  themeColor: string;
  /**
   * CSS custom-property overrides applied via an injected <style> tag —
   * `brand` under `:root`, `brandDark` under `:root[data-pub-theme='dark']`
   * (matching the dark-token block in src/public/uiUpdates.css). Empty
   * objects inject nothing, keeping the NWSA build untouched. Any CSS
   * variable name can go here, including `--org-font` (see `fonts` below)
   * and the `-deep`/`-light` gradient-stop variants read by public.css /
   * director.css / welcomeHub.css.
   */
  brand: Record<string, string>;
  brandDark: Record<string, string>;
  /**
   * Self-hosted @font-face files under public/ for a custom body font —
   * applyBrand() emits the @font-face rules from this list. Empty for NWSA
   * (system font stack only, via base.css's literal fallback). Pair with a
   * `--org-font` entry in `brand` naming the same family plus a fallback
   * stack, e.g. `"'Poppins', 'Segoe UI', system-ui, sans-serif"`.
   */
  fonts: { family: string; weight: number; file: string }[];
  features: {
    /** The /map page (hardcoded MDC Wolfson campus) — NWSA-only. */
    campusMap: boolean;
    /** ScheduleView's "seed 2026-27 NWSA/MDCPS calendar" buttons — NWSA-only. */
    calendarSeed: boolean;
    /** Public parent→admin contact form + director Messages inbox. */
    contactForm: boolean;
  };
  /** Printed concert program (src/public/PublicProgram.tsx). */
  program: {
    missionStatement: string;
    wordmarkMain: string;
    wordmarkSub: string;
    /** Footer credit line under the wordmark ("New World School of the Arts / Music Division"). */
    footerLine1: string;
    footerLine2: string;
    /** Cover-page leadership list; empty array renders nothing. */
    leadership: { name: string; title: string }[];
    /** Partner-institutions line under the mission; empty renders nothing. */
    partners: string;
  };
  /** Vanity short links (see src/shared/vanity.ts). */
  vanitySlugs: { slug: string; match: string[] }[];
  /**
   * Curated always-built calendars (`feeds/bundle-<slug>.ics`). Unlike the
   * hash-addressed filter views, a bundle's ADDRESS is fixed while its
   * membership is resolved fresh each build — which is how "every ensemble
   * that isn't an orchestra" can pick up a Jazz Combo created next term
   * without anyone re-subscribing. Shape: src/shared/calendarBundles.ts.
   * Optional: an org with none simply builds no bundle feeds.
   */
  calendarBundles?: CalendarBundle[];
  /** Fallback allowlist used ONLY when the directors read itself fails (AuthGate). */
  breakGlassEmails: string[];
  /**
   * ICS identity strings. NWSA values are frozen contracts — existing
   * subscribers' UIDs must never change (scripts/generate-feeds.mjs reads
   * the same JSON at deploy time, keeping page and feed output in lockstep).
   */
  ics: {
    /** Feed PRODID — '-//NWSA Music//ggmuze//EN'. */
    prodId: string;
    /** Feed UID domain — 'ggmuze.nwsa' (UID:<eventId>@<uidDomain>). */
    uidDomain: string;
    /** Calendar-name prefix — 'NWSA' ("NWSA · All events"). */
    namePrefix: string;
    /** X-WR-CALDESC for the all-events feed. */
    allDesc: string;
    /** "— NWSA Music" suffix brand in per-ensemble/per-student names. */
    brand: string;
    /** PRODID for single-event .ics downloads (AddToCalendar). */
    fileProdId: string;
    /** UID domain for single-event downloads — 'nwsa-music-hub'. */
    fileUidDomain: string;
  };
  /** public/manifest.json fields rewritten at build time. */
  manifest: {
    name: string;
    shortName: string;
    description: string;
  };
}
