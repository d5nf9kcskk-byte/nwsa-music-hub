import { useState, useMemo } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './components/views/HomeView';
import { RulesView } from './components/views/RulesView';
import { CardsView } from './components/views/CardsView';
import { TilesView } from './components/views/TilesView';
import { FamiliesView } from './components/views/FamiliesView';
import { ServantsView } from './components/views/ServantsView';
import { SortHelperView } from './components/views/SortHelperView';
import { FAQView } from './components/views/FAQView';
import { SearchView } from './components/views/SearchView';
import { AIChatView } from './components/views/AIChatView';
import { useSearch } from './hooks/useSearch';
import type { View } from './types';

// Data imports
import { BASE_FAMILIES, BASE_GENTRY, BASE_TILES, BASE_RULES } from './data/base-game';
import { WESSEX_FAMILY, WESSEX_GENTRY, WESSEX_TILES } from './data/wessex';
import { HOWARD_FAMILY, UD_GENTRY, UD_TILES, UD_RULES } from './data/upstairs-downstairs';
import { CHARACTERS_GENTRY, CHARACTERS_RULES } from './data/characters';
import { USEFUL_BOX_GENTRY, USEFUL_BOX_TILES, USEFUL_BOX_RULES, SORT_MANIFESTS } from './data/useful-box';
import { ALL_SERVANTS } from './data/servants';
import { FAQ_ENTRIES } from './data/faq';

export default function App() {
  const [view, setView] = useState<View>('home');

  // Combine all data
  const allFamilies = useMemo(() => [
    ...BASE_FAMILIES,
    WESSEX_FAMILY,
    HOWARD_FAMILY,
  ], []);

  const allGentry = useMemo(() => [
    ...BASE_GENTRY,
    ...WESSEX_GENTRY,
    ...UD_GENTRY,
    ...CHARACTERS_GENTRY,
    ...USEFUL_BOX_GENTRY,
  ], []);

  const allTiles = useMemo(() => [
    ...BASE_TILES,
    ...WESSEX_TILES,
    ...UD_TILES,
    ...USEFUL_BOX_TILES,
  ], []);

  const { query, setQuery, results } = useSearch(
    allGentry,
    allTiles,
    ALL_SERVANTS,
    FAQ_ENTRIES,
  );

  const navigate = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const openSearch = () => {
    setView('search');
    window.scrollTo(0, 0);
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomeView onNavigate={navigate} />;
      case 'rules':
        return (
          <RulesView
            baseRules={BASE_RULES}
            udRules={UD_RULES}
            charsRules={CHARACTERS_RULES}
            usefulBoxRules={USEFUL_BOX_RULES}
          />
        );
      case 'cards':
        return <CardsView cards={allGentry} />;
      case 'tiles':
        return <TilesView tiles={allTiles} />;
      case 'families':
        return <FamiliesView families={allFamilies} />;
      case 'servants':
        return <ServantsView servants={ALL_SERVANTS} />;
      case 'sort':
        return <SortHelperView manifests={SORT_MANIFESTS} />;
      case 'faq':
        return <FAQView entries={FAQ_ENTRIES} />;
      case 'search':
        return (
          <SearchView
            query={query}
            setQuery={setQuery}
            results={results}
            onClose={() => navigate('home')}
          />
        );
      case 'chat':
        return <AIChatView />;
      default:
        return <HomeView onNavigate={navigate} />;
    }
  };

  return (
    <Layout currentView={view} onNavigate={navigate} onSearchClick={openSearch}>
      {renderView()}
    </Layout>
  );
}
