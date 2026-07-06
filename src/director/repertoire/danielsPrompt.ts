/**
 * Shared instruction block for AI repertoire enrichment. Kept in one place so
 * the in-app "Fill with AI" and the GitHub-Action script stay identical.
 * The Node script has its own copy of this text (scripts/enrich-repertoire.mjs)
 * because it can't import from src/ — keep the two in sync.
 */
export const DANIELS_PROMPT = `INSTRUMENTATION — return "instrumentation" using the Daniels' Orchestral Music shorthand EXACTLY, sections separated by " — " in this order:
  woodwinds — brass — percussion — keyboards/harp — strings
- Woodwinds: four numbers Flute.Oboe.Clarinet.Bassoon, with doublings in square brackets using pic (piccolo), afl (alto flute), Eh (English horn), Ebcl (E-flat clarinet), bcl (bass clarinet), cbn (contrabassoon). e.g. 3[1.2.pic] 2[1.2/Eh] 2 2
- Brass: four numbers Horn.Trumpet.Trombone.Tuba. e.g. 4 2 3 1  (use cnt for cornets if the score specifies cornets)
- Percussion: write "tmp" for timpani, then "+N" for the number of OTHER percussionists. e.g. tmp+3
- Keyboards/harp: hp (harp), cel (celesta), pf (piano), org (organ); omit this section entirely if none.
- Strings: "str".
Full example: "3[1.2.pic] 2[1.2/Eh] 2 2 — 4 2 3 1 — tmp+3 — hp — str"

PERCUSSION — return "percussion" as a comma-separated list of the SPECIFIC percussion instruments the work calls for (do NOT abbreviate here), e.g. "Snare Drum, Bass Drum, Cymbals, Triangle, Tam-tam, Glockenspiel, Xylophone". If the work uses timpani only, return "Timpani only". This field is required and must be complete and accurate — it is critical for the percussion section.`;
