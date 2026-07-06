import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { MapPin } from 'lucide-react';
import { useLocations } from '../director/hooks/useLocations';
import './campusMap.css';

/**
 * /map — campus map + plain-English location directory (#15).
 * The map image is optional: drop campus-map.png into public/ and it appears;
 * until then a friendly placeholder shows. The directory list below is always
 * useful, image or not. Rows carry their mapAnchor as an element id so
 * "/map#band-hall" links from <LocationText> land on the right entry.
 */
export function CampusMap() {
  const { locations, loading } = useLocations();
  const [imgFailed, setImgFailed] = useState(false);
  const { hash } = useLocation();
  const anchor = hash.replace(/^#/, '');

  // SPA navigation doesn't auto-scroll to fragments; do it once the list is in.
  useEffect(() => {
    if (!anchor || loading) return;
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [anchor, loading]);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Campus Map</h1>

      {imgFailed ? (
        <div className="pub-card pub-muted pub-map-placeholder">
          <MapPin size={22} />
          <div>Campus map coming soon</div>
        </div>
      ) : (
        <img
          className="pub-map-img"
          src={`${import.meta.env.BASE_URL}campus-map.png`}
          alt="NWSA campus map"
          onError={() => setImgFailed(true)}
        />
      )}

      <h2 className="pub-section-title">Where things are</h2>
      {loading ? (
        <div className="pub-card pub-muted">Loading locations…</div>
      ) : locations.length === 0 ? (
        <div className="pub-card pub-muted">No locations listed yet.</div>
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
