import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Ensemble, Student } from './types';

/**
 * Starter data sourced from the original Notion workspace.
 * Document IDs are stable slugs so importing is idempotent — running it
 * again overwrites the same docs rather than creating duplicates.
 */

export const seedEnsembles: Ensemble[] = [
  { id: 'symphony-orchestra',        name: 'Symphony Orchestra',        order: 1 },
  { id: 'wind-ensemble',             name: 'Wind Ensemble',             order: 2 },
  { id: 'camerata-string-orchestra', name: 'Camerata String Orchestra', order: 3 },
  { id: 'jazz-ensemble',             name: 'Jazz Ensemble',             order: 4 },
  { id: 'chamber-winds',             name: 'Chamber Winds',             order: 5 },
  { id: 'college-chamber-orchestra', name: 'College Chamber Orchestra', order: 6, defaultStartTime: '14:30', defaultEndTime: '15:45', meetingDays: [4] },
  { id: 'high-school-choir',         name: 'High School Choir',         order: 7 },
  { id: 'opera-orchestra',           name: 'Opera Orchestra',           order: 8 },
];

export const seedStudents: Student[] = [
  { id: 'green-piper-k',         name: 'Green, Piper K.',         instrument: 'Tuba',       grade: '10th', status: 'Active',    ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'wild-ava-s',            name: 'Wild, Ava S.',            instrument: 'Violin',     grade: '9th',  status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'paz-isabella',          name: 'Paz, Isabella',           instrument: 'Clarinet',   grade: '12th', status: 'Graduated', ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'sirulnik-damian-r',     name: 'Sirulnik, Damian R.',     instrument: 'Bass',       grade: '11th', status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'toscano-carlos-e',      name: 'Toscano, Carlos E.',      instrument: 'Trumpet',    grade: '9th',  status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'leyva-juan-c',          name: 'Leyva, Juan C.',          instrument: 'Saxophone',  grade: '12th', status: 'Graduated', ensembleIds: ['jazz-ensemble', 'wind-ensemble'] },
  { id: 'torres-axel',           name: 'Torres, Axel',            instrument: 'Trumpet',    grade: '9th',  status: 'Active',    ensembleIds: ['jazz-ensemble', 'wind-ensemble'] },
  { id: 'rothenberg-sam-a',      name: 'Rothenberg, Sam A.',      instrument: 'Trumpet',    grade: '11th', status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'rey-jayson',            name: 'Rey, Jayson',             instrument: 'Clarinet',   grade: '10th', status: 'Active',    ensembleIds: ['jazz-ensemble', 'wind-ensemble'] },
  { id: 'tortor-chermaine-r',    name: 'Tortor, Chermaine R.',    instrument: 'Percussion', grade: '10th', status: 'Active',    ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'caraisco-kadence-i',    name: 'Caraisco, Kadence I.',    instrument: 'Flute',      grade: '12th', status: 'Graduated', ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'bruner-pearson-a',      name: 'Bruner, Pearson A.',      instrument: 'Cello',      grade: '10th', status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'sendra-pierre',         name: 'Sendra, Pierre',          instrument: 'Trumpet',    grade: '10th', status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'olivas-samuel-j',       name: 'Olivas, Samuel J.',       instrument: 'Horn',       grade: '9th',  status: 'Active',    ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'mantilla-mateo-s',      name: 'Mantilla, Mateo S.',      instrument: 'Trombone',   grade: '9th',  status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'perez-blunden-kalel-l', name: 'Perez-Blunden, Kalel L.', instrument: 'Trombone',   grade: '11th', status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'maldonado-kenlie-d',    name: 'Maldonado, Kenlie D.',    instrument: 'Clarinet',   grade: '9th',  status: 'Active',    ensembleIds: ['chamber-winds', 'wind-ensemble'] },
  { id: 'dawson-rachel-w',       name: 'Dawson, Rachel W.',       instrument: 'Cello',      grade: '11th', status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'ramirez-alexander',     name: 'Ramirez, Alexander',      instrument: 'Trombone',   grade: '10th', status: 'Active',    ensembleIds: ['wind-ensemble'] },
  { id: 'marrero-catalina',      name: 'Marrero, Catalina',       instrument: 'Violin',     grade: '9th',  status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'sanchez-gisella-m',     name: 'Sanchez, Gisella M.',     instrument: 'Trumpet',    grade: '12th', status: 'Graduated', ensembleIds: ['wind-ensemble'] },
  { id: 'pierre-joselme-g',      name: 'Pierre, Joselme G.',      instrument: 'Clarinet',   grade: '11th', status: 'Active',    ensembleIds: ['symphony-orchestra', 'wind-ensemble'] },
  { id: 'mercado-valentina',     name: 'Mercado, Valentina',      instrument: 'Cello',      grade: '9th',  status: 'Active',    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'] },
  { id: 'maldonado-roulen-l',    name: 'Maldonado, Roulen L.',    instrument: 'Trumpet',    grade: '12th', status: 'Graduated', ensembleIds: ['wind-ensemble'] },
];

/**
 * Writes all ensembles and students to Firestore in a single atomic batch,
 * under the currently signed-in user's session (subject to security rules).
 */
export async function seedRoster(): Promise<{ ensembles: number; students: number }> {
  if (!db) throw new Error('Firebase is not configured.');
  const batch = writeBatch(db);

  for (const { id, ...data } of seedEnsembles) {
    batch.set(doc(db, 'ensembles', id), data);
  }
  for (const { id, ...data } of seedStudents) {
    batch.set(doc(db, 'students', id), data);
  }

  await batch.commit();
  return { ensembles: seedEnsembles.length, students: seedStudents.length };
}
