import { FileText, ExternalLink, Download } from 'lucide-react';
import { DOC_CATEGORY_COLOR } from '../../shared/docMeta';
import { NotesText } from './NotesText';
import type { LibraryDocument } from '../../director/types';

/** One document as a tappable card — opens the uploaded file or external link
 *  in a new tab. Shared by the public Documents page and per-ensemble lists. */
export function PubDocCard({ doc, ensembleNames }: { doc: LibraryDocument; ensembleNames?: string }) {
  const href = doc.file?.url ?? doc.url;
  const color = DOC_CATEGORY_COLOR[doc.category];
  if (!href) return null;
  return (
    <a className="pub-doc-card" href={href} target="_blank" rel="noreferrer">
      <span className="pub-doc-icon" style={{ color }}><FileText size={20} /></span>
      <div className="pub-doc-main">
        <div className="pub-doc-title">{doc.title}</div>
        <div className="pub-doc-meta">
          <span className="pub-doc-badge" style={{ background: color + '1f', color }}>{doc.category}</span>
          {doc.audience && doc.audience !== 'All' && <span className="pub-doc-tag">{doc.audience}</span>}
          {ensembleNames && <span className="pub-doc-tag">{ensembleNames}</span>}
        </div>
        {doc.description && <div className="pub-doc-desc"><NotesText text={doc.description} /></div>}
      </div>
      <span className="pub-doc-open" aria-hidden>
        {doc.file ? <Download size={16} /> : <ExternalLink size={16} />}
      </span>
    </a>
  );
}
