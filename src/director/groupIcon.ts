/**
 * The icon a group's meeting wears on a schedule (#masterclass-icons).
 *
 * `EVENT_TYPE_ICON` answers "what KIND of meeting is this" and a class gets
 * 📚 — right for Music Theory, wrong for the four string master classes, which
 * are the only classes where the students bring instruments and play. A
 * director scanning Tuesday afternoon sees four identical book icons for
 * Violin / Viola / Cello / Bass and has to read the names to tell them apart.
 *
 * So a MASTER CLASS is iconed by what it plays. The instrument is read out of
 * the group's own name through `scoreOrderRank` — the ONE ranking table — so
 * there is no second list of instrument spellings, and a "Flute Masterclass"
 * created next term picks up a woodwind icon without anyone editing this file.
 * A master class whose instrument the ranking cannot read keeps the class icon
 * rather than guessing.
 *
 * Every other group, and every non-class event, is untouched.
 */
import { scoreOrderRank } from './scoreOrder.ts';
import { isMasterClass } from './groupKind.ts';
import type { Ensemble, EventType } from './types.ts';

/**
 * The icon for a KIND of meeting. Lives here, not in utils.ts, so this module
 * imports nothing that reaches the org config and can load under Node's
 * type-stripping loader — which is what lets its self-check run without the
 * Vite defines shim. `utils.ts` re-exports it, so every existing import site
 * is unchanged.
 *
 * 'Class' sits next to Rehearsal — both are roll-taking meetings of an
 * ensemble/section — with Concert/Event (no roll) after.
 */
export const EVENT_TYPE_ICON: Record<EventType, string> = {
  Rehearsal: '🎵',
  Class: '📚',
  Concert: '🎭',
  Sectional: '🎻',
  Event: '📌',
};

/**
 * The instrument inside a group's name — "Bass Masterclass" → "Bass".
 *
 * Needed because the ranking table anchors the string bass as `^bass$`, so
 * that "Bassoon" and "bass guitar" don't land in the string section. That
 * anchor is right and must stay; it just means the class words have to come
 * off the name before the instrument can be read out of it.
 */
function instrumentFromGroupName(name: string): string {
  return name.replace(/\b(master\s*class|masterclass|class|section|studio|lab)\b/gi, '').trim();
}

/**
 * The icon for an instrument, by where it ranks in score order.
 *
 * The strings split in two because the school runs four string master classes
 * at once and one violin emoji for all of them defeats the purpose. Unicode
 * has no cello and no double bass, so the low strings borrow 🎸 — a big
 * instrument with a long neck and a low register, which reads as "not the
 * violin one" at a glance, which is the whole job here.
 */
function instrumentIcon(name: string): string | null {
  const rank = scoreOrderRank(instrumentFromGroupName(name));
  if (rank < 100) return '🎷'; // woodwinds
  if (rank < 200) return '🎺'; // brass
  if (rank < 300) return '🥁'; // percussion
  if (rank < 400) return '🎹'; // keys / rhythm
  if (rank < 420) return '🎻'; // violin, viola
  if (rank < 500) return '🎸'; // cello, bass — no cello emoji exists
  if (rank < 600) return '🎤'; // voice
  return null; // 998 = unrecognized, 999 = none found in the name
}

/**
 * The icon for one meeting: the group's instrument when it is a master class,
 * the event type's icon otherwise.
 *
 * Takes the groups already resolved rather than ids and a map, so the caller
 * decides how to look them up. The FIRST master class among them wins — a
 * meeting shared by two sections is vanishingly rare and either icon is right.
 */
export function eventIcon(
  type: EventType,
  groups: (Pick<Ensemble, 'name' | 'kind'> | undefined)[],
): string {
  for (const g of groups) {
    if (!g || !isMasterClass(g)) continue;
    const icon = instrumentIcon(g.name);
    if (icon) return icon;
  }
  return EVENT_TYPE_ICON[type];
}

/** The icon for a group on its own, outside any meeting — the class list, the
 *  public nav. Null for anything that is not a master class we can read, so a
 *  caller keeps whatever it already shows. */
export function groupIcon(group: Pick<Ensemble, 'name' | 'kind'>): string | null {
  return isMasterClass(group) ? instrumentIcon(group.name) : null;
}
