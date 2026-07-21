import { useState } from 'react';
import { ChevronLeft, MapPin, Pencil, Plus } from 'lucide-react';
import { useLocations } from '../hooks/useLocations';
import { EditedByLine } from '../components/EditedByLine';
import type { CampusLocation } from '../types';
import './locations.css';

interface Props {
  onClose: () => void;
}

/**
 * Campus location directory CRUD (#15). Maps the short room strings used on
 * events ("Room 121") to a plain-English label ("Band Hall") plus directions.
 * Public pages render these via <LocationText> and the /map directory.
 */
export function LocationsManager({ onClose }: Props) {
  const { locations, loading, addLocation, updateLocation, deleteLocation } = useLocations();
  const [editing, setEditing] = useState<CampusLocation | 'new' | null>(null);

  if (editing) {
    return (
      <LocationForm
        location={editing === 'new' ? null : editing}
        onSave={async data => {
          if (editing === 'new') await addLocation(data);
          else await updateLocation(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deleteLocation(editing.id) : undefined}
        onBack={() => setEditing(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Campus Locations</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {!loading && locations.length === 0 && (
            <div className="dir-loc-empty">
              No locations yet. Add the rooms you use on events — students see
              "Room 121 — Band Hall" plus directions instead of a bare room number.
            </div>
          )}
          {locations.map(loc => (
            <div key={loc.id} className="dir-loc-row" onClick={() => setEditing(loc)}>
              <MapPin size={16} className="dir-loc-pin" />
              <div className="dir-loc-info">
                <div className="dir-loc-name">
                  {loc.room}
                  {loc.label && <span className="dir-loc-label"> — {loc.label}</span>}
                </div>
                {loc.directions && <div className="dir-loc-sub">{loc.directions}</div>}
              </div>
              <button
                className="dir-icon-btn"
                onClick={e => { e.stopPropagation(); setEditing(loc); }}
                aria-label={`Edit ${loc.room}`}
              >
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add Location
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormProps {
  location: CampusLocation | null;
  onSave: (data: Omit<CampusLocation, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

function LocationForm({ location, onSave, onDelete, onBack, onClose }: FormProps) {
  const [room, setRoom] = useState(location?.room ?? '');
  const [label, setLabel] = useState(location?.label ?? '');
  const [directions, setDirections] = useState(location?.directions ?? '');
  const [mapAnchor, setMapAnchor] = useState(location?.mapAnchor ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const valid = room.trim() && label.trim();

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({
        room: room.trim(),
        label: label.trim(),
        directions: directions.trim() || undefined,
        mapAnchor: mapAnchor.trim() || undefined,
      });
      onBack();
    } catch {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          <span className="dir-drawer-title">{location ? 'Edit Location' : 'New Location'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {location && <EditedByLine updatedAt={location.updatedAt} updatedBy={location.updatedBy} />}
          <div className="dir-field">
            <label className="dir-label">Room *</label>
            <input className="dir-input" value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. Room 121" />
            <div className="dir-loc-hint">Must match the location text you type on events, exactly.</div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Plain-English label *</label>
            <input className="dir-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Band Hall" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Directions</label>
            <input className="dir-input" value={directions} onChange={e => setDirections(e.target.value)} placeholder="e.g. enter through East doors" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Map anchor</label>
            <input className="dir-input" value={mapAnchor} onChange={e => setMapAnchor(e.target.value)} placeholder="e.g. band-hall" />
            <div className="dir-loc-hint">Optional id on the campus map page; adds a "Where is this?" link on public pages.</div>
          </div>

          {location && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>Delete Location</button>
            )
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !valid}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
