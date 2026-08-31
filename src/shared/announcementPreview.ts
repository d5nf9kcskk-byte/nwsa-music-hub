import { richTextToPlain } from './richTextParse';

/**
 * A one-line taste of an announcement body for a banner or a list row.
 *
 * Strips the formatting markers first: these previews used to slice the raw
 * text, so the moment a director used the toolbar an alert banner read
 * "**Bring** your [folder](/documents)" instead of the sentence they wrote.
 * Newlines collapse too — a banner is one line by definition.
 */
export function announcementPreview(body: string, max: number): string {
  const flat = richTextToPlain(body).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
