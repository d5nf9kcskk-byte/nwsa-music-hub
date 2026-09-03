import { useCallback, useRef, useState, type ReactElement } from 'react';

/**
 * The decoy field (#honeypot) behind the two unauthenticated public writes
 * that have no roster anchor to lean on — an 'open' sign-up and the parent
 * contact form. A bot fills every input it finds, the payload then carries a
 * `website` key, and `keys().hasOnly(...)` in firestore.rules rejects the
 * create. That is the whole brake on those two forms, so it stays.
 *
 * What it must never catch is a BROWSER. Chrome's address autofill and most
 * password managers will fill a field that is merely positioned off-screen,
 * and a decoy filled that way is indistinguishable from a bot at the rules
 * layer — which is exactly the failure a director reported in Sept 2026: the
 * college-info sign-up went through on an iPhone (Safari fills only fields it
 * can see) and answered "check your connection" on every other browser, on
 * every retry, because the autofilled value never cleared. Two guards, and
 * both matter:
 *
 *   1. `.pub-hp` is `visibility: hidden` at zero size, not just parked
 *      off-screen. Browser autofill and password managers skip a field they
 *      cannot see; a bot reading the HTML still finds it.
 *   2. `botFields()` discards a value the browser put there, via the
 *      `:autofill` pseudo-class (`:-webkit-autofill` on Chrome and Safari).
 *      A bot assigning `.value` never matches it.
 *
 * The check runs at SUBMIT rather than on change: the autofill flag lands a
 * tick after the value does.
 */
export function useHoneypot(): {
  /** Spread into the payload — `{ website }` only when a BOT filled it. */
  botFields: () => { website?: string };
  field: ReactElement;
} {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');

  const botFields = useCallback(
    () => (value.trim() && !browserFilled(ref.current) ? { website: value.slice(0, 120) } : {}),
    [value],
  );

  const field = (
    <input
      ref={ref}
      className="pub-hp"
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
    />
  );

  return { botFields, field };
}

/** Did the browser — or a password manager riding its autofill — put this
 *  here? `:autofill` is the standard spelling; Chrome and Safari answer to
 *  the prefixed one, and an engine that knows neither throws on `matches()`
 *  rather than returning false. */
function browserFilled(el: HTMLInputElement | null): boolean {
  if (!el) return false;
  for (const sel of [':autofill', ':-webkit-autofill']) {
    try {
      if (el.matches(sel)) return true;
    } catch { /* selector unsupported in this engine */ }
  }
  return false;
}
