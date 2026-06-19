import type { GentryCard, ImprovementTile, RuleSection, SortManifest } from '../types';

export const USEFUL_BOX_GENTRY: GentryCard[] = [
  {
    id: 'lady-mary-shelton',
    name: 'Lady Mary Shelton',
    type: 'prestige',
    expansion: 'useful-box',
    gender: 'female',
    reputationRequired: 3,
    favors: [{ type: 'card', description: 'An additional male guest may attend any activity Lady Mary attends' }, { type: 'reputation', description: 'Gain 2 reputation' }],
    vp: 3,
    flavorText: 'A great facilitator of social connections, particularly between eligible young men and the county families.',
  },
  {
    id: 'aston-webb',
    name: 'Aston Webb',
    type: 'prestige',
    expansion: 'useful-box',
    gender: 'male',
    reputationRequired: 3,
    favors: [{ type: 'tile', description: 'Acquire one improvement tile from the marketplace at no monetary cost' }],
    vp: 2,
    flavorText: 'The celebrated architect permits you to acquire one improvement tile free of charge.',
  },
];

export const USEFUL_BOX_TILES: ImprovementTile[] = [
  {
    id: 'promo-wine-cellar',
    name: 'Wine Cellar',
    category: 'service',
    expansion: 'useful-box',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £300 (fine wines appreciate your hospitality)'] },
    level2: { vp: 3, favors: ['Gain £400 and 1 Reputation'] },
    requires: { servants: ['butler', 'footman'], guestCount: 2 },
    activityType: 'dining',
    notes: 'Promotional tile from the Useful Box.',
  },
  {
    id: 'promo-stables',
    name: 'Stables',
    category: 'estate',
    expansion: 'useful-box',
    reputationRequired: 2,
    cost: 400,
    level1: { vp: 3, favors: ['Gain £200 and 2 Reputation'] },
    level2: { vp: 5, favors: ['Gain £300 and 3 Reputation', 'Draw a male guest card'] },
    requires: { servants: ['footman', 'valet'], guestCount: 2, guestGender: 'male' },
    activityType: 'outdoor',
    notes: 'Promotional tile — Stables enable equestrian activities.',
  },
  {
    id: 'promo-gallery',
    name: 'Picture Gallery',
    category: 'prestige',
    expansion: 'useful-box',
    reputationRequired: 4,
    cost: 600,
    level1: { vp: 4, favors: ['Gain 3 Reputation', 'Draw 2 guest cards'] },
    level2: { vp: 7, favors: ['Gain 4 Reputation', 'Draw 3 guest cards', 'Gain £200'] },
    requires: { servants: ['butler', 'ladysmaid'], guestCount: 3 },
    activityType: 'social',
    notes: 'Promotional prestige tile — Picture Gallery exhibition.',
  },
  {
    id: 'promo-archery',
    name: 'Archery Range',
    category: 'sporting',
    expansion: 'useful-box',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £200 and 1 Reputation'] },
    level2: { vp: 4, favors: ['Gain £300 and 2 Reputation'] },
    requires: { servants: ['footman'], guestCount: 2 },
    activityType: 'sporting',
    notes: 'Promotional sporting tile.',
  },
];

export const USEFUL_BOX_RULES: RuleSection[] = [
  {
    id: 'ub-overview',
    expansion: 'useful-box',
    title: 'Useful Box Overview',
    content: `The Useful Box is a supplementary content package that contains:

**New Content:**
- Promotional Gentry cards (including Lady Mary Shelton and Aston Webb)
- New Improvement Tiles across multiple categories
- New Rule cards explaining additional content

**Support Content:**
- Solo Opponent cards for the Upstairs, Downstairs expansion
- Dynamic AI opponent cards with different personality strategies
- Updated and corrected component versions from the base game and previous expansions

**Availability:**
Originally an exclusive for the 2019 Kickstarter campaign, the Useful Box content was later made available as a free print-and-play download for owners of the printed game editions.`,
  },
  {
    id: 'ub-dynamic-ai',
    expansion: 'useful-box',
    title: 'Dynamic AI Solo Opponents',
    content: `The Useful Box introduces the Dynamic AI system, providing solo opponents with distinct personalities and strategies:

- Each Dynamic AI opponent has a unique priority system (Reputation-focused, Wealth-focused, Tile-focused, etc.)
- Different opponents make different decisions when faced with the same die results
- This ensures much greater variety in solo play than the standard opponent cards
- The Dynamic AI is compatible with all expansions and game modes

The print-and-play Personality DAI Variant Files are available for free download from the Kayenta Publishing resources page.`,
  },
];

export const SORT_MANIFESTS: SortManifest[] = [
  {
    expansion: 'base',
    label: 'Base Game',
    color: '#8b1a1a',
    gentry: [
      { type: 'family', count: 16, notes: '4 family cards per family (Asquith, Cavendish, Ponsonby, York) + Dowager for Asquith' },
      { type: 'fairchild', count: 2, notes: 'Mr. Charles Fairchild + Miss Elizabeth Fairchild (kept in Courtship deck)' },
      { type: 'starter', count: 15, notes: 'Distributed to players at setup; unused go to casual supply' },
      { type: 'casual', count: 35, notes: 'Main gentry supply' },
      { type: 'prestige', count: 25, notes: 'Prestige supply (separate from casual)' },
    ],
    tiles: [
      { category: 'essential', count: 14, names: ['Private Study (×4 starting)', 'Front Parlour (×4 starting)', 'Library', 'Dining Room', 'Morning Room', 'Green Room', '+ others'] },
      { category: 'service', count: 14, names: ["Butler's Room (×4 starting)", 'Brushing Room', 'Green Room (hybrid)', '+ others'] },
      { category: 'estate', count: 14, names: ['Main Gazebo (×4 starting)', 'Conservatory', 'South Lawn (hybrid)', '+ others'] },
      { category: 'prestige', count: 13, names: ['Drawing Room', 'Music Room', 'Club Room', 'Ballroom', '+ others'] },
      { category: 'sporting', count: 16, names: ['Bowling Green (×4 starting)', 'Billiard Room', 'Hunting Lodge', 'South Lawn (hybrid)', '+ others'] },
      { category: 'monument', count: 6, names: ['Garden Fountain', 'Triumphal Arch', '+ others'] },
    ],
    servants: ['butler', 'valet', 'ladysmaid', 'housekeeper', 'footman', 'underbutler'],
    families: ['Asquith', 'Cavendish', 'Ponsonby', 'York'],
    specialComponents: [
      '30 VP Cards (mix into Courtship deck)',
      '10 Theme Cards (shuffle into Courtship deck)',
      '30 Objective Cards (deal 5 per player)',
      '4 Player Boards',
      '1 Supply Board',
      '1 Round Track Board',
      'Money tokens (various denominations)',
      'Reputation markers (per player)',
      '20-sided die (for solo play)',
      'Servant meeples (various colors)',
    ],
  },
  {
    expansion: 'wessex',
    label: 'Wessex Expansion',
    color: '#1a4a2e',
    gentry: [
      { type: 'family', count: 3, notes: 'Wessex family cards (Lord, Lady, Mr. Wessex)' },
      { type: 'starter', count: 5, notes: 'Wessex starter guests — add to starter supply' },
      { type: 'casual', count: 5, notes: 'Wessex casual guests — add to casual supply' },
      { type: 'prestige', count: 5, notes: 'Wessex prestige guests — add to prestige supply' },
    ],
    tiles: [
      { category: 'essential', count: 2, names: ['Breakfast Room', 'Retiring Room'] },
      { category: 'sporting', count: 1, names: ['Tennis Court'] },
      { category: 'monument', count: 1, names: ['Obelisk'] },
    ],
    servants: [],
    families: ['Wessex'],
    specialComponents: [
      '1 Wessex Player Board',
      '6 New Solo Opponent Cards',
      '2 Starting Tile options (choose Breakfast Room + Tennis Court OR Morning Room + Retiring Room)',
      'Updated Order of Play reference card',
    ],
  },
  {
    expansion: 'upstairs-downstairs',
    label: 'Upstairs, Downstairs',
    color: '#1a2a5c',
    gentry: [
      { type: 'family', count: 2, notes: 'Howard family cards' },
      { type: 'casual', count: 30, notes: 'New casual guests — add to casual supply' },
      { type: 'prestige', count: 19, notes: 'New prestige guests — add to prestige supply' },
    ],
    tiles: [
      { category: 'service', count: 3, names: ["Servants' Hall", 'Kitchen', 'Laundry Room'] },
      { category: 'sporting', count: 1, names: ['Croquet Lawn'] },
      { category: 'estate', count: 1, names: ["Artist's Studio"] },
    ],
    servants: ['cook', 'hallboy', 'headhousemaid', 'usefulman'],
    families: ['Howard'],
    specialComponents: [
      '1 Howard Player Board',
      '10 Milestone Cards (select 2 at setup)',
      'Larger Courtship Cards (replace base game versions)',
      '14 New Solo Opponent Cards',
      'Cooperative Obsession rules and Sneyd AI cards',
      'Solo Estate Challenge scoring pads',
      '1 Supply Board Extension',
      '1 Round Track (extended play)',
      '35 Custom Wooden Meeples',
    ],
  },
  {
    expansion: 'characters',
    label: 'Characters Expansion',
    color: '#3d1a5c',
    gentry: [
      { type: 'casual', count: 8, notes: 'New casual guests including Second Chance Servants and worker placement characters — add to casual supply' },
      { type: 'prestige', count: 20, notes: 'New prestige guests including Constable Bucket and Dowager Marchioness — add to prestige supply' },
    ],
    tiles: [],
    servants: [],
    families: [],
    specialComponents: [
      '52 New Objective Cards (permanently replace two previous objective decks)',
      '2 Fiery Sermon Cards (special mechanic)',
      '14 New Solo Opponent Cards',
      '4 Distinguished Family Member cards (1 per base family)',
      'Worker Placement character tokens',
      'Second Chance Servant tokens',
    ],
  },
  {
    expansion: 'useful-box',
    label: 'Useful Box',
    color: '#5c3d00',
    gentry: [
      { type: 'prestige', count: 2, notes: 'Lady Mary Shelton + Aston Webb — add to prestige supply' },
    ],
    tiles: [
      { category: 'service', count: 7, names: ['Wine Cellar', '+ 6 others'] },
      { category: 'estate', count: 2, names: ['Stables', '+ 1 other'] },
      { category: 'essential', count: 2, names: ['2 promotional essential tiles'] },
      { category: 'prestige', count: 3, names: ['Picture Gallery', '+ 2 others'] },
      { category: 'sporting', count: 1, names: ['Archery Range'] },
    ],
    servants: [],
    families: [],
    specialComponents: [
      'Dynamic AI Opponent Cards (various personalities)',
      'Solo Opponent Cards for Upstairs/Downstairs',
      'Rule cards for new content',
      'Corrected component replacements',
      'Note: Some Useful Box content is available as free print-and-play',
    ],
  },
  {
    expansion: 'promo',
    label: 'Promo Tiles (2019 KS)',
    color: '#2a2a2a',
    gentry: [],
    tiles: [
      { category: 'service', count: 7, names: ['Promotional Service tiles (designed by backers)'] },
      { category: 'estate', count: 2, names: ['Promotional Estate tiles'] },
      { category: 'essential', count: 2, names: ['Promotional Essential tiles'] },
      { category: 'prestige', count: 3, names: ['Promotional Prestige tiles'] },
      { category: 'sporting', count: 1, names: ['Promotional Sporting tile'] },
    ],
    servants: [],
    families: [],
    specialComponents: [
      'Note: These promotional tiles were designed by Kickstarter backers and NOT tested for game balance',
      'Use at your own discretion — some tiles may be over- or under-powered',
      'Mix into the appropriate tile stacks when using',
    ],
  },
];
