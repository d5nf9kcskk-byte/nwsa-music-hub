/**
 * Pins the master class icons (#masterclass-icons).
 *
 * The whole design is "read the instrument out of the group's name through the
 * ONE ranking table", which is only worth anything if the four sections the
 * school actually runs come out right — and if everything else is left alone.
 * `Bass Masterclass` is the one that bites: the ranking anchors the string
 * bass as `^bass$` so that Bassoon stays a woodwind, which means the class
 * words have to come off the name before the rank is asked for.
 */
import { eventIcon, groupIcon } from './groupIcon';
import { MASTERCLASS_SECTIONS } from './masterclassSections';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const mc = (name: string) => ({ name, kind: 'masterclass' as const });

// ── The four string sections, by the names the school uses ────────────
{
  const want: Record<string, string> = {
    'masterclass-violin': '🎻',
    'masterclass-viola': '🎻',
    'masterclass-cello': '🎸',
    'masterclass-bass': '🎸',
  };
  for (const section of MASTERCLASS_SECTIONS) {
    const got = groupIcon(mc(section.name));
    assert(got === want[section.id],
      `${section.name} should icon as ${want[section.id]}, got ${String(got)}`);
  }
  // Every one of them resolved — a name the ranking cannot read returns null,
  // and null quietly falling back to 📚 is the bug this file exists to catch.
  assert(MASTERCLASS_SECTIONS.length === 4, 'the four string sections are still the set');
}

// ── Only a master class is iconed by instrument ───────────────────────
{
  assert(groupIcon({ name: 'Violin Masterclass', kind: 'class' }) === null,
    'an ordinary class keeps the class icon, even one with an instrument in its name');
  assert(groupIcon({ name: 'Symphony Orchestra' }) === null,
    'a performing ensemble is not iconed by instrument here');
  assert(eventIcon('Class', [{ name: 'Music Theory', kind: 'class' }]) === '📚',
    'Music Theory still gets the class icon');
  assert(eventIcon('Rehearsal', [mc('Violin Masterclass')]) === '🎻',
    'the group wins over the event type when the group is a master class');
  assert(eventIcon('Class', [undefined, mc('Cello Masterclass')]) === '🎸',
    'an unresolved group id is skipped, not treated as a miss');
}

// ── A master class the ranking cannot read keeps the class icon ───────
{
  assert(groupIcon(mc('Wednesday Master Class')) === null,
    'no instrument in the name means no guess');
  assert(eventIcon('Class', [mc('Wednesday Master Class')]) === '📚',
    'and the meeting falls back to its event type');
}

// ── A future section picks up an icon with no edit to this table ──────
{
  assert(groupIcon(mc('Flute Masterclass')) === '🎷', 'woodwind');
  assert(groupIcon(mc('Trumpet Masterclass')) === '🎺', 'brass');
  assert(groupIcon(mc('Percussion Masterclass')) === '🥁', 'percussion');
  assert(groupIcon(mc('Voice Masterclass')) === '🎤', 'voice');
}

console.log('groupIcon.selfcheck: OK');
