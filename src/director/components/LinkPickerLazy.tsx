import './directorSearch.css';
import { Suspense, lazy } from 'react';
import { Search, X } from 'lucide-react';

/**
 * The link picker, loaded on demand.
 *
 * It reaches every Firestore hook in the app, so a static import drags that
 * whole graph into each of the dozen-odd screens that only wanted a text box
 * — and makes the toolbar unrenderable outside a browser, which is how the
 * contract self-check caught it. EVERY caller must come through here: one
 * static import anywhere puts the module back in the main chunk and the split
 * silently stops happening (Rolldown says so as INEFFECTIVE_DYNAMIC_IMPORT,
 * which is easy to miss in a build log).
 *
 * The stylesheet is imported here rather than in the picker because the shell
 * below needs it in the very moment the picker's chunk has not arrived.
 */
const LinkPicker = lazy(() => import('./LinkPicker').then(m => ({ default: m.LinkPicker })));

interface Props {
  onPick: (label: string, url: string) => void;
  onClose: () => void;
}

/** Same chrome as the real picker, so it is replaced in place rather than the
 *  panel appearing out of nothing. Without it the button that opens the picker
 *  visibly did nothing for the length of one fetch. */
function LinkPickerShell({ onClose }: { onClose: () => void }) {
  return (
    <div className="dir-search-overlay" role="dialog" aria-modal="true" aria-label="Insert link" onClick={onClose}>
      <div className="dir-linkpick" onClick={e => e.stopPropagation()}>
        <div className="dir-linkpick-head">
          <Search size={15} className="dir-linkpick-search-icon" />
          <input
            className="dir-linkpick-input"
            placeholder="Find a concert, class, document, sign-up…"
            aria-label="Search for something to link to"
            disabled
          />
          <button className="dir-linkpick-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="dir-linkpick-list" aria-busy="true">
          <div className="dir-linkpick-empty">Loading…</div>
        </div>
      </div>
    </div>
  );
}

export function LazyLinkPicker({ onPick, onClose }: Props) {
  return (
    <Suspense fallback={<LinkPickerShell onClose={onClose} />}>
      <LinkPicker onPick={onPick} onClose={onClose} />
    </Suspense>
  );
}
