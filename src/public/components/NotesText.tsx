import { RichText } from '../../shared/richText';

/**
 * Director-typed text, rendered. Kept as a named component because half the
 * app already calls it; the parsing and formatting live in
 * `src/shared/richText.tsx`, which is the one definition of what the
 * formatting toolbar's markup means.
 */
export function NotesText({ text }: { text: string }) {
  return <RichText text={text} />;
}
