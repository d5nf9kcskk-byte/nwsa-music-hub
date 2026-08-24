import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import './documents.css';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useDocuments } from '../director/hooks/useDocuments';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { ensembleColor, ensembleDisplayName, musicEnsembles, performingEnsembles, classGroups, groupKindLabel, isPublished } from '../director/utils';
import { DOC_CATEGORIES, DOC_CATEGORY_COLOR } from '../shared/docMeta';
import { FilterMenu } from '../shared/FilterMenu';
import { PubDocCard } from './components/PubDocCard';
import { EmptyState, SkeletonCards } from './components/PageHeader';
import { t, useLang } from '../shared/i18n';

/**
 * /documents — the public document library. Handbooks, syllabi, forms, and
 * other resources, grouped as "General documents" (school-wide), then one
 * section per ensemble, then the CLASSES under their own heading (#classes) —
 * a student hunting for the Music Theory syllabus should not have to read past
 * the orchestras to find it. Two multi-select filters narrow by ensemble and by
 * document type (e.g. Symphony → Syllabus, or General → Handbook).
 *
 * Nothing here widens what is world-readable: `documents` and `ensembles` are
 * already `allow read` in firestore.rules and always have been. This ship only
 * changes how the already-public list is grouped and labelled.
 */
export function PublicDocuments() {
  useLang();
  const { ensembles } = useEnsembles();
  const { documents, loading } = useDocuments();
  const now = useMinuteTick(); // a scheduled document appears the minute it publishes

  const [filterEnsembleIds, setFilterEnsembleIds] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);

  const music = useMemo(() => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)), [ensembles]);

  // General documents (no ensemble tag) always show regardless of the ensemble
  // filter — a handbook is relevant to everyone; the type filter still applies.
  const shown = useMemo(() => documents.filter(d => {
    if (!isPublished(d, now)) return false;
    if (typeFilters.length > 0 && !typeFilters.includes(d.category)) return false;
    if (filterEnsembleIds.length === 0) return true;
    return d.ensembleIds.length === 0 || d.ensembleIds.some(id => filterEnsembleIds.includes(id));
  }), [documents, typeFilters, filterEnsembleIds, now]);

  const general = shown.filter(d => d.ensembleIds.length === 0);
  const groupsFor = (list: typeof music) => list
    .filter(e => filterEnsembleIds.length === 0 || filterEnsembleIds.includes(e.id))
    .map(e => ({ ens: e, docs: shown.filter(d => d.ensembleIds.includes(e.id)) }))
    .filter(g => g.docs.length > 0);
  const ensGroups = groupsFor(performingEnsembles(music));
  const classDocGroups = groupsFor(classGroups(music));

  const nothing = !loading && general.length === 0 && ensGroups.length === 0 && classDocGroups.length === 0;
  const filtering = filterEnsembleIds.length > 0 || typeFilters.length > 0;

  return (
    <div className="pub-page">
      <h1 className="pub-h1">{t('docs.title')}</h1>
      <p className="pub-muted" style={{ marginTop: -4 }}>{t('docs.intro')}</p>

      {documents.length > 0 && (
        <div className="pub-filter-selects">
          <FilterMenu
            prefix="pub"
            allLabel={t('docs.allEnsembles')}
            ariaLabel={t('nav.ensembles')}
            options={music.map(e => ({ value: e.id, label: ensembleDisplayName(e), color: ensembleColor(e) }))}
            selected={filterEnsembleIds}
            onChange={setFilterEnsembleIds}
          />
          <FilterMenu
            prefix="pub"
            allLabel={t('docs.allTypes')}
            ariaLabel={t('docs.allTypes')}
            options={DOC_CATEGORIES.map(c => ({ value: c, label: c, color: DOC_CATEGORY_COLOR[c] }))}
            selected={typeFilters}
            onChange={setTypeFilters}
          />
        </div>
      )}

      {loading ? (
        <SkeletonCards n={3} />
      ) : nothing ? (
        <EmptyState icon={<FolderOpen size={26} />}>
          {filtering ? t('docs.noneFilter') : t('docs.none')}
        </EmptyState>
      ) : (
        <>
          {general.length > 0 && (
            <>
              <div className="pub-doc-group-title">{t('docs.general')}</div>
              <div className="pub-doc-list">
                {general.map(d => <PubDocCard key={d.id} doc={d} />)}
              </div>
            </>
          )}
          {ensGroups.map(({ ens, docs }) => (
            <div key={ens.id}>
              <div className="pub-doc-group-title">{ensembleDisplayName(ens)}</div>
              <div className="pub-doc-list">
                {docs.map(d => <PubDocCard key={d.id} doc={d} />)}
              </div>
            </div>
          ))}
          {classDocGroups.length > 0 && <div className="pub-doc-section-head">{t('docs.classes')}</div>}
          {classDocGroups.map(({ ens, docs }) => (
            <div key={ens.id}>
              <div className="pub-doc-group-title">
                {ensembleDisplayName(ens)}
                {/* Under a "Classes" band, "class" says nothing — only the
                    college and master-class distinctions earn the space. */}
                {groupKindLabel(ens) !== 'class' && (
                  <span className="pub-doc-kind">{groupKindLabel(ens)}</span>
                )}
              </div>
              <div className="pub-doc-list">
                {docs.map(d => <PubDocCard key={d.id} doc={d} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
