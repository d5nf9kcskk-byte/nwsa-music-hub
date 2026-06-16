import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import type { GentryCard, ImprovementTile, ServantDef, FAQEntry } from '../types';

export interface SearchResult {
  type: 'gentry' | 'tile' | 'servant' | 'faq';
  id: string;
  name: string;
  description: string;
  expansion: string;
  original: GentryCard | ImprovementTile | ServantDef | FAQEntry;
}

export function useSearch(
  gentryCards: GentryCard[],
  tiles: ImprovementTile[],
  servants: ServantDef[],
  faqEntries: FAQEntry[],
) {
  const [query, setQuery] = useState('');

  const allItems = useMemo((): SearchResult[] => [
    ...gentryCards.map(g => ({
      type: 'gentry' as const,
      id: g.id,
      name: g.name,
      description: g.flavorText || g.favors.map(f => f.description).join('; '),
      expansion: g.expansion,
      original: g,
    })),
    ...tiles.map(t => ({
      type: 'tile' as const,
      id: t.id,
      name: t.name,
      description: `${t.category} — ${t.level1.favors.join('; ')}`,
      expansion: t.expansion,
      original: t,
    })),
    ...servants.map(s => ({
      type: 'servant' as const,
      id: s.type,
      name: s.name,
      description: s.description,
      expansion: s.expansion,
      original: s,
    })),
    ...faqEntries.map(f => ({
      type: 'faq' as const,
      id: f.id,
      name: f.question,
      description: f.answer.slice(0, 120) + '...',
      expansion: f.expansion,
      original: f,
    })),
  ], [gentryCards, tiles, servants, faqEntries]);

  const fuse = useMemo(() => new Fuse(allItems, {
    keys: ['name', 'description', 'expansion'],
    threshold: 0.35,
    minMatchCharLength: 2,
  }), [allItems]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    return fuse.search(query).map(r => r.item).slice(0, 40);
  }, [fuse, query]);

  return { query, setQuery, results };
}
