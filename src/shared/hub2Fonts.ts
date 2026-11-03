/**
 * Hub 2.0 fonts (#hub2-look), self-hosted. Loaded ONLY by a dynamic import
 * from hub2Preview.ts while the preview is on, so a device without it never
 * sees these @font-face rules, let alone the files.
 *
 * Latin subset only (it covers Spanish), and only the weights in use. The
 * .woff2 files are kept OUT of the service-worker precache (globIgnores
 * 'assets/*.woff2' in vite.config.ts) and runtime-cached on first use, so
 * every other visitor downloads none of them. hub2.selfcheck.ts pins that the
 * first family of every stack in the org config is one loaded here.
 */
// Studio Bright body: Plus Jakarta Sans, 400 to 800.
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
// Concert Hall titles: Newsreader 400 / 600.
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/latin-600.css';
// Spotlight (concert night): Sora for display, Manrope for body.
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';

// Side effects only: the self-check reads the import lines above as text.
export {};
