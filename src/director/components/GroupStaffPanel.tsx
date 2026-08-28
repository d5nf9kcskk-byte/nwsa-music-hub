import { Mail, Phone } from 'lucide-react';
import type { GroupStaffMember } from '../groupStaff';

/** Assigned director/teacher with MDC contact — director hub styling. */
export function GroupStaffPanel({ staff, heading = 'Staff' }: { staff: GroupStaffMember[]; heading?: string }) {
  const shown = staff.filter(s => s.name);
  if (!shown.length) return null;
  return (
    <div className="dir-hub-staff">
      <div className="dir-form-section-label">{heading}</div>
      {shown.map(s => (
        <div key={s.name} className="dir-hub-staff-row">
          <div className="dir-hub-staff-name">{s.name}</div>
          <div className="dir-hub-staff-contact">
            {s.mdcEmail && (
              <a href={`mailto:${s.mdcEmail}`} className="dir-hub-staff-link">
                <Mail size={13} /> {s.mdcEmail}
              </a>
            )}
            {s.phone && (
              <a href={`tel:${s.phone.replace(/\D/g, '')}`} className="dir-hub-staff-link">
                <Phone size={13} /> {s.phone}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Same data on the public ensemble/class page. */
export function PublicGroupStaffPanel({ staff }: { staff: GroupStaffMember[] }) {
  const shown = staff.filter(s => s.name);
  if (!shown.length) return null;
  return (
    <div className="pub-staff-block">
      {shown.map(s => (
        <div key={s.name} className="pub-staff-row">
          <div className="pub-staff-name">{s.name}</div>
          <div className="pub-staff-contact">
            {s.mdcEmail && <a href={`mailto:${s.mdcEmail}`}>{s.mdcEmail}</a>}
            {s.phone && <a href={`tel:${s.phone.replace(/\D/g, '')}`}>{s.phone}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
