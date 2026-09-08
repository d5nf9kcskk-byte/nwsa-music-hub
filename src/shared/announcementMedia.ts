import type { Announcement, Attachment } from '../director/types';

/**
 * What counts as a PICTURE rather than a download.
 *
 * The form has two fields — Pictures and Attachments — but a director who
 * drops a flyer into the wrong one still meant "show this". A picture that
 * arrives as a paperclip link families have to download defeats the whole
 * point of the feature, so the answer is decided HERE, at render time, by
 * looking at the file, and every surface reads it through this module: the
 * public card, the director list row, and the upload field's own preview.
 *
 * Storage download URLs carry the original name in the path (and a query
 * string after it), so the extension is read from the attachment's `name`,
 * falling back to the URL path with any `?…` stripped.
 */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif|svg)$/i;

export function isImageAttachment(a: Attachment): boolean {
  if (IMAGE_EXT.test(a.name)) return true;
  try {
    return IMAGE_EXT.test(new URL(a.url).pathname);
  } catch {
    return IMAGE_EXT.test(a.url.split('?')[0]);
  }
}

/** Everything on this post that should render as a visible picture. */
export function announcementPictures(a: Pick<Announcement, 'images' | 'files'>): Attachment[] {
  return [...(a.images ?? []), ...(a.files ?? []).filter(isImageAttachment)];
}

/** Everything on this post that should render as a download row. */
export function announcementDownloads(a: Pick<Announcement, 'files'>): Attachment[] {
  return (a.files ?? []).filter(f => !isImageAttachment(f));
}
