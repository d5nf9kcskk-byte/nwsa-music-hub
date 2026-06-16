import { Home, BookOpen, Users, MoreHorizontal, Grid3X3, User, Search } from 'lucide-react';
import type { View } from '../types';

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  onSearchClick: () => void;
  children: React.ReactNode;
}

type NavId = View | 'more';

const NAV_ITEMS: { id: NavId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'rules', label: 'Rules', icon: BookOpen },
  { id: 'cards', label: 'Cards', icon: Users },
  { id: 'tiles', label: 'Tiles', icon: Grid3X3 },
  { id: 'families', label: 'Families', icon: User },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

const MORE_VIEWS: View[] = ['servants', 'sort', 'faq', 'search'];

export function Layout({ currentView, onNavigate, onSearchClick, children }: Props) {
  const isMore = MORE_VIEWS.includes(currentView);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo" onClick={() => onNavigate('home')} role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate('home')}>
            <div className="logo-crest">O</div>
            <div className="logo-text">
              Obsession
              <span className="logo-sub">Victorian Wiki</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button className="search-btn" onClick={onSearchClick} aria-label="Search">
            <Search size={14} />
            Search
          </button>
        </div>
      </header>

      <main className="app-main">
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = id === 'more' ? isMore : currentView === id;
          const handleClick = () => id === 'more' ? onNavigate('servants') : onNavigate(id as View);
          return (
            <button
              key={id}
              className={`nav-btn ${isActive ? 'active' : ''}`}
              onClick={handleClick}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
