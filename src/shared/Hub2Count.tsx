import { useState } from 'react';

/**
 * A number that rolls when it changes, under the Hub 2.0 look (#hub2-alive).
 *
 * The span takes the value as its key, so React mounts a fresh one for each
 * new value and its CSS animation starts again. The first value does not
 * roll: a page arriving is not a change. Only hub2Public.css styles
 * .hub2-count, so with the look off this is plain text in a plain span.
 */
export function Hub2Count({ value }: { value: number | string }) {
  const [seen, setSeen] = useState({ value, changed: false });
  if (!Object.is(seen.value, value)) setSeen({ value, changed: true }); // Object.is: NaN equals itself, so it can't loop
  return <span key={String(value)} className={seen.changed ? 'hub2-count hub2-roll' : 'hub2-count'}>{value}</span>;
}
