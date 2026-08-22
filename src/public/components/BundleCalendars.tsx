import { CalendarPlus } from 'lucide-react';
import { bundleFeedUrl, webcalUrl } from '../feedUrl';
import type { Platform } from '../platform';
import { ORG } from '../../org';
// Self-contained: the director's subscribe sheet renders this too, and that
// shell never imports SubscribeButton (where this stylesheet otherwise
// arrives). CSS imports dedupe, so the public side is unaffected.
import './subscribeButton.css';

/**
 * The school's ready-made calendars, offered in every subscribe sheet.
 *
 * These are the answer to "I want one calendar for all of this": curated in
 * `config/orgs/*.json`, built on every deploy, so unlike an ad-hoc filter mix
 * there is never anything to wait for. They are also defined not to overlap,
 * so subscribing to several does not repeat the same school day on each one.
 */
export function BundleCalendars({ platform, heading, className = '' }: {
  platform: Platform;
  heading: string;
  className?: string;
}) {
  const bundles = ORG.calendarBundles ?? [];
  if (bundles.length === 0) return null;

  return (
    <div className={`pub-subw-split ${className}`.trim()}>
      <div className="pub-subw-split-head">{heading}</div>
      {bundles.map(b => {
        const https = bundleFeedUrl(b.slug);
        return (
          <a
            key={b.slug}
            className="pub-subw-action pub-subw-action-sm pub-subw-bundle"
            href={platform === 'ios'
              ? webcalUrl(https)
              : `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(https))}`}
            {...(platform === 'ios' ? {} : { target: '_blank', rel: 'noreferrer' })}
          >
            <CalendarPlus size={15} />
            <span className="pub-subw-bundle-text">
              <span className="pub-subw-bundle-name">{b.name}</span>
              <span className="pub-subw-bundle-desc">{b.description}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
