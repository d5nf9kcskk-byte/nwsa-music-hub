import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CampusLocation } from '../types';

/**
 * Plain-English location directory (#15). World-readable — public pages use
 * it to translate a raw room string ("Room 121") into "Room 121 — Band Hall"
 * with walking directions; the director CRUDs it from LocationsManager.
 */
export function useLocations() {
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'locations'), orderBy('room'));
    return onSnapshot(q, snap => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as CampusLocation)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addLocation(data: Omit<CampusLocation, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'locations'), data);
  }

  async function updateLocation(id: string, data: Partial<Omit<CampusLocation, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'locations', id), data);
  }

  async function deleteLocation(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'locations', id));
  }

  return { locations, loading, addLocation, updateLocation, deleteLocation };
}
