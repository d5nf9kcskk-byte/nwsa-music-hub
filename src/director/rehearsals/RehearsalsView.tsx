import { useState } from 'react';
import { CalendarPlus, Calendar } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRehearsals } from '../hooks/useRehearsals';
import { RehearsalForm } from './RehearsalForm';
import type { Rehearsal } from '../types';

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function RehearsalsView() {
  const { ensembles } = useEnsembles();
  const [filterEnsembleId, setFilterEnsembleId] = useState<string>('');
  const { rehearsals, addRehearsal, updateRehearsal, deleteRehearsal } = useRehearsals(filterEnsembleId || undefined);
  const [editing, setEditing] = useState<Rehearsal | null | 'new'>(null);

  const ensembleMap = Object.fromEntries(ensembles.map(e => [e.id, e.name]));

  return (
    <div>
      {/* Ensemble filter tabs */}
      <div className="dir-tabs">
        <button className={`dir-tab ${!filterEnsembleId ? 'active' : ''}`} onClick={() => setFilterEnsembleId('')}>All</button>
        {ensembles.map(e => (
          <button
            key={e.id}
            className={`dir-tab ${filterEnsembleId === e.id ? 'active' : ''}`}
            onClick={() => setFilterEnsembleId(e.id)}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="dir-rehearsal-list">
        {rehearsals.length === 0 ? (
          <div className="dir-empty">
            <Calendar size={40} />
            <h3>No rehearsals yet</h3>
            <p>Tap + to log a rehearsal.</p>
          </div>
        ) : (
          rehearsals.map(r => (
            <div key={r.id} className="dir-rehearsal-card" onClick={() => setEditing(r)}>
              <div className="dir-rehearsal-info">
                <div className="dir-rehearsal-date">{formatDate(r.date)}</div>
                <div className="dir-rehearsal-name">{ensembleMap[r.ensembleId] ?? r.ensembleId}</div>
                {r.repertoire && <div className="dir-rehearsal-notes">{r.repertoire}</div>}
                {r.notes && <div className="dir-rehearsal-notes">{r.notes}</div>}
              </div>
              <span className={`dir-rehearsal-status ${r.status}`}>{r.status}</span>
            </div>
          ))
        )}
      </div>

      <button className="dir-fab" onClick={() => setEditing('new')} aria-label="New rehearsal">
        <CalendarPlus size={22} />
      </button>

      {editing !== null && (
        <RehearsalForm
          rehearsal={editing === 'new' ? null : editing}
          ensembles={ensembles}
          onSave={async data => {
            if (editing === 'new') await addRehearsal(data);
            else await updateRehearsal(editing.id, data);
          }}
          onDelete={editing !== 'new' ? async () => deleteRehearsal(editing.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
