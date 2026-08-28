/**
 * NWSA music faculty MDC work emails — sourced from the public faculty pages
 * at nwsa.mdc.edu (not Gmail sign-in addresses). Used when a director doc has
 * no `mdcEmail` yet. Owner can override per person on the Directors screen.
 */
export interface MdcStaffContact {
  name: string;
  mdcEmail: string;
  phone?: string;
}

/** By directors/{email} doc id (Google sign-in). */
export const MDC_BY_LOGIN: Record<string, MdcStaffContact> = {
  'nwsaorchestras@gmail.com': { name: 'Dr. Grant Gilman', mdcEmail: 'ggilman@mdc.edu' },
};

/** By display / conductor name — case-insensitive substring rules, first match wins. */
const MDC_BY_NAME: { pattern: RegExp; contact: MdcStaffContact }[] = [
  { pattern: /\bgrant\b.*\bgilman\b|\bgilman\b.*\bgrant\b/i,
    contact: { name: 'Dr. Grant Gilman', mdcEmail: 'ggilman@mdc.edu' } },
  { pattern: /\bbrent\b.*\bmoung/i,
    contact: { name: 'Brent A. Mounger', mdcEmail: 'brent.mounger@mdc.edu', phone: '305-237-3532' } },
  { pattern: /\bjim\b.*\bgasior\b|\bgasior\b/i,
    contact: { name: 'Jim Gasior', mdcEmail: 'jgasior@mdc.edu', phone: '305-237-3946' } },
  { pattern: /\brichard\b.*\bfleisch/i,
    contact: { name: 'Richard Fleischman', mdcEmail: 'rfleisch@mdc.edu', phone: '305-237-3621' } },
  { pattern: /\bjuan\b.*\bpena\b|\bpena\b.*\bjuan\b/i,
    contact: { name: 'Juan Carlos Peña', mdcEmail: 'jpena10@mdc.edu', phone: '305-237-3622' } },
  { pattern: /\bsusan\b.*\bepstein\b|\bepstein\b/i,
    contact: { name: 'Dr. Susan Epstein', mdcEmail: 'sepstein@mdc.edu', phone: '305-237-3583' } },
];

export function lookupMdcByLogin(loginEmail: string): MdcStaffContact | undefined {
  return MDC_BY_LOGIN[loginEmail.trim().toLowerCase()];
}

export function lookupMdcByName(name: string | undefined): MdcStaffContact | undefined {
  if (!name?.trim()) return undefined;
  return MDC_BY_NAME.find(r => r.pattern.test(name))?.contact;
}

/** Resolve MDC contact for a director — stored field wins, then login, then name. */
export function resolveMdcContact(d: {
  email: string;
  name?: string;
  mdcEmail?: string;
  phone?: string;
}): MdcStaffContact | undefined {
  if (d.mdcEmail?.trim()) {
    return {
      name: d.name?.trim() || lookupMdcByLogin(d.email)?.name || d.email,
      mdcEmail: d.mdcEmail.trim(),
      phone: d.phone ?? lookupMdcByLogin(d.email)?.phone ?? lookupMdcByName(d.name)?.phone,
    };
  }
  return lookupMdcByLogin(d.email) ?? lookupMdcByName(d.name);
}
