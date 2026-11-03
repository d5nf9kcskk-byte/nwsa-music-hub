import { useEffect, useRef, useState } from 'react';
import { Smartphone, Share2, Copy, Check, MessageSquare } from 'lucide-react';
import { t } from '../../shared/i18n';
import { buildTransferUrl, smsHref } from '../../shared/deviceTransfer';
import type { SavedStudent } from '../../shared/identity';

/**
 * "Send to my other phone" (Hub 2.0 item 9), on the Saved-on-this-device
 * card. Builds a link carrying the saved students' doc ids (already public)
 * from this page's own origin + base path, then offers the phone's share
 * sheet, a text message, and a copy button. Nothing is written anywhere:
 * the receiving phone confirms on /add-students before it saves.
 */
export function SendToOtherPhone({ students }: { students: SavedStudent[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (students.length === 0) return null;

  const url = buildTransferUrl(window.location.origin, import.meta.env.BASE_URL, students.map(s => s.id));
  const message = t('xfer.message', { url });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({ title: t('xfer.shareTitle'), text: t('xfer.messageLead'), url });
    } catch { /* cancelled, or refused: the copy button is right there */ }
  }

  function selectLink() {
    setManual(true);
    // The input renders on this pass; select it on the next frame.
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, http, older browser): show the link
      // selected so a long-press copies it.
      selectLink();
    }
  }

  if (!open) {
    return (
      <button type="button" className="pub-xfer-open" onClick={() => setOpen(true)}>
        <Smartphone size={16} /> {t('xfer.open')}
      </button>
    );
  }

  return (
    <div className="pub-xfer-panel" role="group" aria-label={t('xfer.open')}>
      <div className="pub-xfer-title"><Smartphone size={16} /> {t('xfer.open')}</div>
      <p className="pub-xfer-help">{t('xfer.help')}</p>
      <div className="pub-xfer-actions">
        {canShare && (
          <button type="button" className="pub-xfer-btn primary" onClick={share}>
            <Share2 size={16} /> {t('xfer.share')}
          </button>
        )}
        <a className="pub-xfer-btn" href={smsHref(message)}>
          <MessageSquare size={16} /> {t('xfer.text')}
        </a>
        <button type="button" className="pub-xfer-btn" onClick={copy} aria-live="polite">
          {copied ? <><Check size={16} /> {t('xfer.copied')}</> : <><Copy size={16} /> {t('xfer.copy')}</>}
        </button>
      </div>
      {manual && (
        <input
          ref={inputRef}
          className="pub-xfer-link"
          readOnly
          value={url}
          aria-label={t('xfer.linkLabel')}
          onFocus={e => e.currentTarget.select()}
        />
      )}
      <button type="button" className="pub-xfer-close" onClick={() => { setOpen(false); setManual(false); }}>
        {t('xfer.done')}
      </button>
    </div>
  );
}
