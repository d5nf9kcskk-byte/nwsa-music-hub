import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { MapPin, ExternalLink, Building2, GraduationCap, Music, Landmark, Car, ParkingSquare, Theater } from 'lucide-react';
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
  parking:  '#475569',
};

interface Spot {
  key: string;      // anchor id (/map#music-building)
  code: string;     // building number / lot label
  label: string;    // full name in the legend
  role: Role;
  /** Marker position on the official map image, in % of its width/height. */
  x: number;
  y: number;
  Icon: typeof Music;
  blurb: string;
}

// The most-used locations on the Miami Dade College Wolfson Campus, where New
// World School of the Arts is based — exactly as the director called them out.
// x/y place each highlight ring over the building's numbered circle on the
// official map image (public/campus-map.jpg).
const SPOTS: Spot[] = [
  {
    key: 'music-building', code: '4', label: 'Music Building (Building 4)',
    role: 'music', x: 74.5, y: 33.2, Icon: Music,
    blurb: 'Home base for NWSA Music — most music classes, rehearsals, and the music office are here.',
  },
  {
    key: 'academic', code: '5', label: 'Academic Building (Building 5)',
    role: 'academic', x: 17.4, y: 61.4, Icon: GraduationCap,
    blurb: 'General academic classes.',
  },
  {
    key: 'chapman', code: '3', label: 'Chapman (Building 3)',
    role: 'chapman', x: 83.9, y: 30.0, Icon: Building2,
    blurb: 'The location of Chapman (Chapman Conference Center).',
  },
  {
    key: 'library-wolfson', code: '1', label: 'Library & Wolfson Auditorium (Building 1)',
    role: 'venue', x: 63.9, y: 38.3, Icon: Landmark,
    blurb: 'The campus library and Wolfson Auditorium — the main performance venue.',
  },
  {
    key: 'batten-room', code: '2', label: 'Batten Room (Building 2)',
    role: 'venue', x: 59.1, y: 31.3, Icon: Theater,
    blurb: 'The Batten Room is in Building 2.',
  },
  {
    key: 'garage', code: '7', label: 'Parking Garage (Building 7)',
    role: 'parking', x: 62.5, y: 20.1, Icon: Car,
    blurb: 'The main parking garage for the Music Building.',
  },
  {
    key: 'lot-1', code: 'Lot 1', label: 'Parking Lot 1',
    role: 'parking', x: 74.3, y: 22.2, Icon: ParkingSquare,
    blurb: 'Another parking option, off Biscayne Blvd.',
  },
];

/**
 * /map — the official Wolfson Campus map with the most-used locations
 * highlighted (#15). Colored rings sit over the buildings the director called
 * out; tapping one jumps to its legend entry. The Wolfson MapsIndoors link
 * gives full interactive detail, and the Firestore-driven "Where things are"
 * directory below still lists room-level info.
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
      <p className="pub-muted pub-campus-intro">
        The Miami Dade College Wolfson Campus, where New World School of the Arts is
        based. The highlighted rings mark the spots you’ll use most — tap one for details.
      </p>

      {imgFailed ? (
        <div className="pub-card pub-muted pub-map-placeholder">
          <MapPin size={22} />
          <div>Campus map image unavailable — use the interactive map below.</div>
        </div>
      ) : (
        <div className="pub-campus-map-wrap">
          <img
            className="pub-map-img pub-campus-map-img"
            src={`${import.meta.env.BASE_URL}campus-map.jpg`}
            alt="Miami Dade College Wolfson Campus map with NWSA's most-used buildings highlighted"
            onError={() => setImgFailed(true)}
          />
          {SPOTS.map(s => (
            <button
              key={s.key}
              type="button"
              className={`pub-campus-pin${anchor === s.key ? ' active' : ''}`}
              style={{ left: `${s.x}%`, top: `${s.y}%`, borderColor: ROLE_COLOR[s.role], color: ROLE_COLOR[s.role] }}
              onClick={() => focusSpot(s.key)}
              aria-label={`${s.label} — ${s.blurb}`}
              title={s.label}
            />
          ))}
        </div>
      )}

      <a className="pub-campus-mi" href={MAPSINDOORS_URL} target="_blank" rel="noreferrer">
        <MapPin size={16} />
        <span>Open the interactive campus map</span>
        <ExternalLink size={14} />
      </a>

      <h2 className="pub-section-title">Most-used locations</h2>
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
