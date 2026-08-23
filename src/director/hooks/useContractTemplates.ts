import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { ContractTemplate } from '../types';
import { usePersonnelGate } from './personnelGate';

/**
 * Reusable agreement prose (#personnel — `contractTemplates`). Same
 * Owner/Director-only gate as its siblings: the collection holds no
 * per-person data, but what an org offers its musicians is still nobody
 * else's read, and firestore.rules pins the same exact key allowlist.
 *
 * The one behavior beyond CRUD: `version` bumps when a save CHANGES
 * `bodyText` — that number is what gets stamped onto contracts at issue
 * (`templateVersion`), so "issued from v3" stays meaningful after the
 * template moves on. Renames don't bump; a name is not terms. Editing or
 * deleting a template never touches issued contracts, which carry a frozen
 * COPY of the prose.
 */
export function useContractTemplates() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  // Derived, not set synchronously in the effect (react-hooks lint) — see
  // usePersonnel for the reasoning.
  const [settled, setSettled] = useState(false);
  const gate = usePersonnelGate();
  const loading = Boolean(db) && gate !== 'blocked' && !settled;

  useEffect(() => {
    if (!db || gate !== 'open') return;
    const dbRef = db;
    return watchCollection(query(collection(dbRef, 'contractTemplates')), 'contractTemplates', snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContractTemplate));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTemplates(rows);
    }, () => setSettled(true));
  }, [gate]);

  function stamps() {
    return { updatedAt: Date.now(), updatedBy: currentDirectorName() };
  }

  async function addTemplate(
    data: Pick<ContractTemplate, 'name' | 'category' | 'bodyText'>,
  ): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const payload = { ...data, version: 1, ...stamps() };
    const ref = await trackWrite('Template', () => addDoc(collection(dbRef, 'contractTemplates'), payload));
    return ref?.id;
  }

  async function updateTemplate(
    id: string,
    data: Pick<ContractTemplate, 'name' | 'category' | 'bodyText'>,
  ) {
    if (!db) return;
    const cur = templates.find(t => t.id === id);
    if (!cur) return;
    const version = data.bodyText === cur.bodyText ? cur.version : cur.version + 1;
    const dbRef = db;
    await trackWrite('Template update', () =>
      updateDoc(doc(dbRef, 'contractTemplates', id), { ...data, version, ...stamps() }));
  }

  /** Safe at any time: issued contracts hold their own copy of the prose. */
  async function deleteTemplate(id: string) {
    if (!db) return;
    const gone = templates.find(t => t.id === id);
    await deleteDoc(doc(db, 'contractTemplates', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('contractTemplates', id, data, `Deleted template “${gone.name}” — restore?`);
    }
  }

  return { templates, loading, addTemplate, updateTemplate, deleteTemplate };
}
