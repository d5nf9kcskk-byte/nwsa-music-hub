import { Link } from 'react-router';
import { Map } from 'lucide-react';
import { useLocations } from '../../director/hooks/useLocations';
import type { CampusLocation } from '../../director/types';
import './locationText.css';

/** Case-insensitive match of a raw event room string against the directory. */
function findLocation(locations: CampusLocation[], room?: string): CampusLocation | undefined {
  if (!room) return undefined;
  const key = room.trim().toLowerCase();
  return locations.find(l => l.room.trim().toLowerCase() === key);
}

/**
 * Plain-English location (#15): looks the raw room string up in the campus
 * directory and renders "Room 121 — Band Hall" with directions underneath.
 * Falls back to the raw string when there's no match; renders nothing when
 * no room is set at all.
 */
export function LocationText({ room }: { room?: string }) {
  const { locations } = useLocations();
  if (!room) return null;

  const match = findLocation(locations, room);
  if (!match) return <span className="pub-loc-text">{room}</span>;

  return (
    <span className="pub-loc-text">
      <span className="pub-loc-main">
        {match.room} — {match.label}
        {match.mapAnchor && <WhereIsThisLink anchor={match.mapAnchor} />}
      </span>
      {match.directions && <span className="pub-loc-directions">{match.directions}</span>}
    </span>
  );
}

/** Tiny "Where is this?" link to the campus map, anchored to the location. */
export function WhereIsThisLink({ anchor }: { anchor?: string }) {
  return (
    <Link to={anchor ? `/map#${anchor}` : '/map'} className="pub-loc-maplink">
      <Map size={11} /> Where is this?
    </Link>
  );
}
