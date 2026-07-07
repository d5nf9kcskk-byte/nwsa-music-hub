import { useState } from 'react';
import { AttendanceView } from './AttendanceView';
import { TrackerView } from './TrackerView';

type Mode = 'roll' | 'tracker';

export function AttendanceTab({ initialEnsembleId, onNavigate }: { initialEnsembleId?: string | null; onNavigate?: import('../types-nav').DirNavigate }) {
  const [mode, setMode] = useState<Mode>('roll');

  return (
    <div>
      <div className="dir-mode-toggle">
        <button className={`dir-segment-btn ${mode === 'roll' ? 'active' : ''}`} onClick={() => setMode('roll')}>
          Take Roll
        </button>
        <button className={`dir-segment-btn ${mode === 'tracker' ? 'active' : ''}`} onClick={() => setMode('tracker')}>
          Tracker
        </button>
      </div>
      {mode === 'roll' ? <AttendanceView initialEnsembleId={initialEnsembleId} onNavigate={onNavigate} /> : <TrackerView />}
    </div>
  );
}
