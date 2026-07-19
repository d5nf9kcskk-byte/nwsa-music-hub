import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { MapPin, ExternalLink, Building2, GraduationCap, Music, Landmark, Car, ParkingSquare } from 'lucide-react';
import { useLocations } from '../director/hooks/useLocations';
import './campusMap.css';

/** Wolfson-provided interactive campus map (Miami Dade College · MapsIndoors). */
const MAPSINDOORS_URL = 'https://clients.mapsindoors.com/miamidadecollege/745184cc2eac4e19854bbabd/search';

type Role = 'music' | 'academic' | 'chapman' | 'venue' | 'parking';

const ROLE_COLOR: Record<Role, string> = {
  music:    '#0d7e8e', // logo teal — home base
  academic: '#2563eb',
  chapman:  '#7c3aed',
  venue:    '#ca8a04', // gold, reserved for performance venues
  parking:  '#64748b',
};

interface Spot {
  key: string;      // anchor id (/map#music-building)
  code: string;     // building number / lot label
  short: string;    // label on the map tile
  label: string;    // full name in the legend
  role: Role;
  area: string;     // grid-area name
  Icon: typeof Music;
  blurb: string;
}

// The most-used locations on the Miami Dade College Wolfson Campus, where New
// World School of the Arts is based — exactly as the director called them out.
const SPOTS: Spot[] = [
  {
    key: 'music-building', code: '4', short: 'Music', label: 'Music Building',
    role: 'music', area: 'b4', Icon: Music,
    blurb: 'Home base for NWSA Music — most music classes, rehearsals, and the music office are here.',
  },
  {
    key: 'academic', code: '5', short: 'Academic', label: 'Academic Building',
    role: 'academic', area: 'b5', Icon: GraduationCap,
    blurb: 'General academic classes.',
  },
  {
    key: 'chapman', code: '3', short: 'Chapman', label: 'Chapman',
    role: 'chapman', area: 'b3', Icon: Building2,
    blurb: 'The location of Chapman (Chapman Conference Center).',
  },
  {
    key: 'library-wolfson', code: '1', short: 'Library + Wolfson Aud.', label: 'Library & Wolfson Auditorium',
    role: 'venue', area: 'b1', Icon: Landmark,
    blurb: 'The campus library and Wolfson Auditorium — the main performance venue.',
  },
  {
    key: 'garage', code: '7', short: 'Parking garage', label: 'Parking Garage (Building 7)',
    role: 'parking', area: 'b7', Icon: Car,
    blurb: 'The main parking garage for the Music Building.',
  },
  {
    key: 'lot-1', code: 'Lot 1', short: 'Parking', label: 'Parking Lot 1',
    role: 'parking', area: 'lot', Icon: ParkingSquare,
    blurb: 'Another parking option.',
  },
];

/**
 * /map — campus map + plain-English location directory (#15).
 *
 * Because the school's own aerial map isn't bundled, the "Most-used locations"
 * board is a self-contained, color-coded highlight of the buildings the
 * director flagged, backed by the Wolfson interactive map for exact detail. If
 * an official image is dropped in at public/campus-map.png it appears on top.
 * The Firestore-driven "Where things are" directory still lists room details.
 */
export function CampusMap() {
  const { locations, loading } = useLocations();
  const [imgFailed, setImgFailed] = useState(false);
  const { hash } = useLocation();
  const anchor = hash.replace(/^#/, '');

  // SPA navigation doesn't auto-scroll to fragments; do it once the page is in.
  useEffect(() => {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [anchor, loading]);

  function focusSpot(key: string) {
    const el = document.getElementById(key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Campus Map</h1>

      {/* Optional official aerial map: drop public/campus-map.png to show it. */}
      {!imgFailed && (
        <img
          className="pub-map-img"
          src={`${import.meta.env.BASE_URL}campus-map.png`}
          alt="NWSA campus map"
          onError={() => setImgFailed(true)}
        />
      )}

      <h2 className="pub-section-title">Most-used locations</h2>
      <p className="pub-muted pub-campus-intro">
        These are the spots you’ll use most on the Miami Dade College Wolfson Campus,
        where New World School of the Arts is based. Tap a building for details.
      </p>

      <div className="pub-campus-board" role="group" aria-label="Most-used campus locations">
        {SPOTS.map(s => {
          const color = ROLE_COLOR[s.role];
          return (
            <button
              key={s.key}
              type="button"
              className={`pub-campus-tile area-${s.area}${anchor === s.key ? ' active' : ''}`}
              style={{ borderColor: color, background: `${color}14` }}
              onClick={() => focusSpot(s.key)}
              aria-label={`${s.label} — ${s.blurb}`}
            >
              <span className="pub-campus-code" style={{ color }}>{s.code}</span>
              <span className="pub-campus-tile-label">{s.short}</span>
            </button>
          );
        })}
      </div>

      <a className="pub-campus-mi" href={MAPSINDOORS_URL} target="_blank" rel="noreferrer">
        <MapPin size={16} />
        <span>Open the interactive campus map</span>
        <ExternalLink size={14} />
      </a>

      <div className="pub-campus-legend">
        {SPOTS.map(s => {
          const color = ROLE_COLOR[s.role];
          const Icon = s.Icon;
          return (
            <div
              key={s.key}
              id={s.key}
              className={`pub-campus-leg-row${anchor === s.key ? ' highlight' : ''}`}
            >
              <span className="pub-campus-leg-badge" style={{ background: color }}>{s.code}</span>
              <div className="pub-campus-leg-info">
                <div className="pub-campus-leg-title">
                  <Icon size={15} style={{ color }} /> {s.label}
                </div>
                <div className="pub-campus-leg-blurb">{s.blurb}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="pub-section-title">Where things are</h2>
      {loading ? (
        <div className="pub-card pub-muted">Loading locations…</div>
      ) : locations.length === 0 ? (
        <div className="pub-card pub-muted">No room details listed yet.</div>
      ) : (
        <div className="pub-map-list">
          {locations.map(loc => (
            <div
              key={loc.id}
              id={loc.mapAnchor || undefined}
              className={`pub-map-row ${anchor && loc.mapAnchor === anchor ? 'highlight' : ''}`}
            >
              <MapPin size={16} className="pub-map-pin" />
              <div className="pub-map-info">
                <div className="pub-map-room">
                  {loc.room} <span className="pub-map-label">— {loc.label}</span>
                </div>
                {loc.directions && <div className="pub-map-directions">{loc.directions}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
