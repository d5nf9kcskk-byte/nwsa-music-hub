import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { deleteStoredFile } from '../storageCleanup';
import { watchCollection } from '../../shared/watchCollection';
import { FIXTURES_ON, FIXTURE_DOCUMENTS } from './fixtures';
import { currentDirectorName } from '../currentDirector';
import type { LibraryDocument } from '../types';

/**
 * Real-time listener for the document repository (syllabi, handbooks, forms, …).
 * World-readable, so it powers both the director's manager and the public
 * Documents page / per-ensemble document lists. Newest first; the director can
 * re-order within a category via `order`.
 */
export function useDocuments() {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setDocuments(FIXTURE_DOCUMENTS); setLoading(false); return; }
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    return watchCollection(q, 'documents', snap => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryDocument)));
      noteLoadOk('documents');
    }, () => setLoading(false));
  }, []);

  async function addDocument(data: Omit<LibraryDocument, 'id'>) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Document', () => addDoc(collection(dbRef, 'documents'), data));
  }

  async function updateDocument(id: string, data: Partial<Omit<LibraryDocument, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    // The edit form always sends every optional field (file, url, audience,
    // description), passing `undefined` for the ones it cleared. Firestore is
    // configured with ignoreUndefinedProperties, so an undefined value would be
    // SKIPPED and the old value left in place — a removed file/link would
    // silently persist. Convert cleared fields to deleteField() so they're
    // actually removed.
    const payload: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: currentDirectorName() };
    for (const [k, v] of Object.entries(data)) {
      payload[k] = v === undefined ? deleteField() : v;
    }
    const previousFile = documents.find(d => d.id === id)?.file?.url;
    await trackWrite('Document update', () => updateDoc(doc(dbRef, 'documents', id), payload));
    // Replaced or cleared the uploaded file? The old object is now referenced
    // by nothing, so delete it rather than leaving it world-readable at its
    // old URL (audit rec #6). Deliberately AFTER the save, not when the form
    // field changes — cancelling an edit must not delete the live file.
    if ('file' in data && previousFile && data.file?.url !== previousFile) {
      void deleteStoredFile(previousFile);
    }
  }

  async function deleteDocument(id: string) {
    if (!db) return;
    const gone = documents.find(x => x.id === id);
    await deleteDoc(doc(db, 'documents', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      // Once the undo window lapses the delete is final, so the uploaded file
      // goes too — otherwise a "deleted" handbook stays readable forever at
      // its old Storage URL (audit rec #6). External links are left alone.
      offerUndo('documents', id, data, `Deleted "${gone.title}" — restore?`, undefined,
        () => { void deleteStoredFile(gone.file?.url); });
    }
  }

  return { documents, loading, addDocument, updateDocument, deleteDocument };
}
