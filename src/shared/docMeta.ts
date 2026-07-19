import type { DocumentCategory, DocumentAudience } from '../director/types';

/** Document categories in display order, shared by the director manager and the
 *  public Documents page so the two never drift. */
export const DOC_CATEGORIES: DocumentCategory[] = [
  'Syllabus', 'Handbook', 'Form', 'Policy', 'Repertoire', 'Calendar', 'Newsletter', 'Other',
];

export const DOC_AUDIENCES: DocumentAudience[] = ['All', 'High School', 'College'];

/** One stable color per category for badges/accents on both surfaces. */
export const DOC_CATEGORY_COLOR: Record<DocumentCategory, string> = {
  Syllabus:   '#2563eb',
  Handbook:   '#7c3aed',
  Form:       '#0891b2',
  Policy:     '#dc2626',
  Repertoire: '#16a34a',
  Calendar:   '#ca8a04',
  Newsletter: '#db2777',
  Other:      '#64748b',
};
