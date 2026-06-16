import type { Family, GentryCard, ImprovementTile, RuleSection } from '../types';

export const BASE_FAMILIES: Family[] = [
  {
    id: 'asquith',
    name: 'Asquith',
    expansion: 'base',
    startingReputation: 1,
    startingMoney: 0,
    specialBonus: 'Starts with 5 family members (includes Dowager Countess Worth, worth 1 VP)',
    description: 'The Asquith family has the distinction of a Dowager Countess in residence, giving them an extra family card from the very start of the game.',
    color: '#8b1a1a',
  },
  {
    id: 'cavendish',
    name: 'Cavendish',
    expansion: 'base',
    startingReputation: 1.4,
    startingMoney: 0,
    specialBonus: 'Starts at 1.4 Reputation (+3 reputation points above standard)',
    description: 'The most esteemed of the four struggling families trying to return to prominence. Their head start in reputation allows early access to better tiles and guests.',
    color: '#4a1a8b',
  },
  {
    id: 'ponsonby',
    name: 'Ponsonby',
    expansion: 'base',
    startingReputation: 1,
    startingMoney: 300,
    specialBonus: 'Starts with £300',
    description: 'The wealthiest of the four families trying to rebuild. Their financial advantage allows early market purchases before others can afford them.',
    color: '#1a4a1a',
  },
  {
    id: 'york',
    name: 'York',
    expansion: 'base',
    startingReputation: 1,
    startingMoney: 0,
    extraServants: ['footman'],
    specialBonus: 'Starts with one extra Footman servant',
    description: 'Famous for the excellence of their domestic staff. The extra Footman allows York to host outdoor activities earlier and more frequently than other families.',
    color: '#1a3a5c',
  },
];

export const BASE_GENTRY: GentryCard[] = [
  // Fairchild cards
  {
    id: 'charles-fairchild',
    name: 'Mr. Charles Fairchild',
    type: 'fairchild',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 0,
    favors: [{ type: 'vp', amount: 8, description: '8 Victory Points' }, { type: 'reputation', description: 'Significant reputation boost' }],
    vp: 8,
    flavorText: 'The son of the most influential family in Derbyshire. Winning his attendance is the ultimate prize.',
  },
  {
    id: 'elizabeth-fairchild',
    name: 'Miss Elizabeth Fairchild',
    type: 'fairchild',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 0,
    favors: [{ type: 'vp', amount: 8, description: '8 Victory Points' }, { type: 'card', description: 'Draw additional guest cards' }],
    vp: 8,
    flavorText: 'The daughter of the most influential family in Derbyshire. Beloved by all who meet her.',
  },
  // Family cards (Asquith)
  {
    id: 'asquith-lord',
    name: 'Lord Asquith',
    type: 'family',
    expansion: 'base',
    gender: 'male',
    favors: [{ type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 1,
  },
  {
    id: 'asquith-lady',
    name: 'Lady Asquith',
    type: 'family',
    expansion: 'base',
    gender: 'female',
    favors: [{ type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 1,
  },
  {
    id: 'asquith-son',
    name: 'Mr. Asquith',
    type: 'family',
    expansion: 'base',
    gender: 'male',
    favors: [{ type: 'card', description: 'Draw a guest card' }],
    vp: 1,
  },
  {
    id: 'asquith-daughter',
    name: 'Miss Asquith',
    type: 'family',
    expansion: 'base',
    gender: 'female',
    favors: [{ type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 1,
  },
  {
    id: 'asquith-dowager',
    name: 'Dowager Countess Worth',
    type: 'family',
    expansion: 'base',
    gender: 'female',
    favors: [{ type: 'vp', amount: 1, description: '1 bonus VP at game end' }],
    vp: 1,
    flavorText: 'The formidable dowager keeps the estate in order with an iron hand and a velvet glove.',
  },
  // Sample Casual Guests (base game has 35 total)
  {
    id: 'sir-william-bromley',
    name: 'Sir William Bromley',
    type: 'casual',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 1,
    flavorText: 'A landed gentleman of modest means but impeccable manners.',
  },
  {
    id: 'mrs-eleanor-march',
    name: 'Mrs. Eleanor March',
    type: 'casual',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 1,
    favors: [{ type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 1,
    flavorText: 'A widow of the county who attends every social function without fail.',
  },
  {
    id: 'reverend-thomas-price',
    name: 'Reverend Thomas Price',
    type: 'casual',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'card', description: 'Draw a casual guest card' }],
    vp: 1,
    flavorText: 'The local vicar, always welcome at table for his entertaining sermons and fine appetite.',
  },
  {
    id: 'miss-constance-hill',
    name: 'Miss Constance Hill',
    type: 'casual',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 2,
    favors: [{ type: 'money', amount: 300, description: 'Gain £300' }],
    vp: 2,
    flavorText: 'An accomplished musician whose performances are much sought after.',
  },
  {
    id: 'colonel-edward-shaw',
    name: 'Colonel Edward Shaw',
    type: 'casual',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 2,
    favors: [{ type: 'reputation', description: 'Gain 2 reputation' }],
    vp: 2,
    flavorText: 'A decorated veteran whose tales of adventure never fail to entertain.',
  },
  // Sample Prestige Guests (base game has 25 total)
  {
    id: 'duchess-of-pemberton',
    name: 'The Duchess of Pemberton',
    type: 'prestige',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 3,
    favors: [{ type: 'reputation', description: 'Gain 3 reputation' }, { type: 'card', description: 'Draw a prestige guest card' }],
    vp: 3,
    flavorText: 'Her Grace commands respect wherever she goes, and her approval can make a season.',
  },
  {
    id: 'lord-henry-wentworth',
    name: 'Lord Henry Wentworth',
    type: 'prestige',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 3,
    favors: [{ type: 'money', amount: 500, description: 'Gain £500' }],
    vp: 3,
    flavorText: 'A lord whose patronage is worth more than gold to the aspiring family.',
  },
  {
    id: 'lady-victoria-ashbourne',
    name: 'Lady Victoria Ashbourne',
    type: 'prestige',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 4,
    favors: [{ type: 'reputation', description: 'Gain 4 reputation' }],
    vp: 4,
    flavorText: 'One of the most celebrated hostesses in England, now guest in your own home.',
  },
  {
    id: 'sir-james-blackwood',
    name: 'Sir James Blackwood',
    type: 'prestige',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 4,
    favors: [{ type: 'vp', amount: 2, description: '2 bonus VP' }, { type: 'money', amount: 300, description: 'Gain £300' }],
    vp: 4,
    flavorText: 'A knight whose connections extend to the highest circles of power.',
  },
  {
    id: 'countess-isabella-drummond',
    name: 'Countess Isabella Drummond',
    type: 'prestige',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 5,
    favors: [{ type: 'reputation', description: 'Gain 5 reputation' }, { type: 'penalty', description: 'Lose £100 (her expenses)' }],
    vp: 5,
    flavorText: 'Her presence elevates any gathering, though her standards are exacting.',
  },
  // Starter guests (15 total in base)
  {
    id: 'mr-thomas-baker',
    name: 'Mr. Thomas Baker',
    type: 'starter',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 0,
    favors: [{ type: 'money', amount: 100, description: 'Gain £100' }],
    vp: 0,
    flavorText: 'A local merchant, reliable if unspectacular.',
  },
  {
    id: 'mrs-sarah-baker',
    name: 'Mrs. Sarah Baker',
    type: 'starter',
    expansion: 'base',
    gender: 'female',
    reputationRequired: 0,
    favors: [{ type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 0,
    flavorText: 'A merchant\'s wife, eager to make connections with the county families.',
  },
  {
    id: 'dr-charles-finch',
    name: 'Dr. Charles Finch',
    type: 'starter',
    expansion: 'base',
    gender: 'male',
    reputationRequired: 0,
    favors: [{ type: 'card', description: 'Draw a guest card' }],
    vp: 0,
    flavorText: 'The local physician, universally liked and always welcome.',
  },
];

export const BASE_TILES: ImprovementTile[] = [
  // Starting tiles (every player begins with these)
  {
    id: 'private-study',
    name: 'Private Study',
    category: 'essential',
    expansion: 'base',
    reputationRequired: 1,
    cost: 0,
    level1: { vp: 1, favors: ['Gain £100 and 1 Reputation on Village Fair rounds'] },
    level2: { vp: 2, favors: ['Gain £200 and 2 Reputation on Village Fair rounds'] },
    requires: { servants: ['butler'], guestCount: 1 },
    activityType: 'social',
    notes: 'Starting tile — every player begins with this. Especially valuable on Village Fair rounds.',
  },
  {
    id: 'butlers-room',
    name: "Butler's Room",
    category: 'service',
    expansion: 'base',
    reputationRequired: 1,
    cost: 0,
    level1: { vp: 1, favors: ['Hire a new servant'] },
    level2: { vp: 2, favors: ['Hire two new servants'] },
    requires: { servants: ['butler'], guestCount: 1 },
    activityType: 'social',
    notes: 'Starting tile — allows early servant hiring.',
  },
  {
    id: 'main-gazebo',
    name: 'Main Gazebo',
    category: 'estate',
    expansion: 'base',
    reputationRequired: 1,
    cost: 0,
    level1: { vp: 1, favors: ['Gain £200'] },
    level2: { vp: 2, favors: ['Gain £300 and 1 Reputation'] },
    requires: { servants: ['footman'], guestCount: 1 },
    activityType: 'outdoor',
    notes: 'Starting tile — outdoor social gathering.',
  },
  {
    id: 'front-parlour',
    name: 'Front Parlour',
    category: 'essential',
    expansion: 'base',
    reputationRequired: 1,
    cost: 0,
    level1: { vp: 1, favors: ['Gain 1 Reputation'] },
    level2: { vp: 2, favors: ['Gain 2 Reputation'] },
    requires: { servants: ['housekeeper'], guestCount: 1 },
    activityType: 'social',
    notes: 'Starting tile — simple reputation building.',
  },
  {
    id: 'bowling-green',
    name: 'Bowling Green',
    category: 'sporting',
    expansion: 'base',
    reputationRequired: 1,
    cost: 0,
    level1: { vp: 1, favors: ['Gain £100 and 1 Reputation'] },
    level2: { vp: 2, favors: ['Gain £200 and 2 Reputation'] },
    requires: { servants: ['footman'], guestCount: 2, guestGender: 'male' },
    activityType: 'sporting',
    notes: 'Starting tile — lawn sporting activity requiring male guests.',
  },
  // Market tiles — Essential
  {
    id: 'library',
    name: 'Library',
    category: 'essential',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Draw 2 guest cards'] },
    level2: { vp: 4, favors: ['Draw 3 guest cards'] },
    requires: { servants: ['butler'], guestCount: 2 },
    activityType: 'social',
  },
  {
    id: 'music-room',
    name: 'Music Room',
    category: 'prestige',
    expansion: 'base',
    reputationRequired: 3,
    cost: 400,
    level1: { vp: 3, favors: ['Gain 3 Reputation', 'Draw a prestige guest card'] },
    level2: { vp: 5, favors: ['Gain 4 Reputation', 'Draw 2 prestige guest cards'] },
    requires: { servants: ['butler', 'ladysmaid'], guestCount: 2 },
    activityType: 'musical',
    notes: 'Music Recital — highly prestigious activity.',
  },
  {
    id: 'billiard-room',
    name: 'Billiard Room',
    category: 'sporting',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £300'] },
    level2: { vp: 4, favors: ['Gain £400 and 1 VP'] },
    requires: { servants: ['valet'], guestCount: 2, guestGender: 'male' },
    activityType: 'leisure',
  },
  {
    id: 'dining-room',
    name: 'Dining Room',
    category: 'essential',
    expansion: 'base',
    reputationRequired: 2,
    cost: 400,
    level1: { vp: 2, favors: ['Gain £200 and 1 Reputation'] },
    level2: { vp: 4, favors: ['Gain £300 and 2 Reputation'] },
    requires: { servants: ['housekeeper', 'footman'], guestCount: 3 },
    activityType: 'dining',
    notes: 'Formal Dinner — requires more staff and guests.',
  },
  {
    id: 'drawing-room',
    name: 'Drawing Room',
    category: 'prestige',
    expansion: 'base',
    reputationRequired: 3,
    cost: 500,
    level1: { vp: 3, favors: ['Gain 2 Reputation', 'Draw a guest card'] },
    level2: { vp: 5, favors: ['Gain 3 Reputation', 'Draw 2 guest cards'] },
    requires: { servants: ['butler', 'housekeeper'], guestCount: 3 },
    activityType: 'social',
    notes: 'Afternoon social gathering of considerable prestige.',
  },
  {
    id: 'ballroom',
    name: 'Ballroom',
    category: 'prestige',
    expansion: 'base',
    reputationRequired: 5,
    cost: 700,
    level1: { vp: 5, favors: ['Gain 5 Reputation', 'Gain £200'] },
    level2: { vp: 8, favors: ['Gain 6 Reputation', 'Gain £400', 'Draw prestige guest'] },
    requires: { servants: ['butler', 'valet', 'ladysmaid'], guestCount: 4 },
    activityType: 'formal',
    notes: 'Grand Ball — the most prestigious activity in the game.',
  },
  {
    id: 'conservatory',
    name: 'Conservatory',
    category: 'estate',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain 1 Reputation and 1 VP'] },
    level2: { vp: 3, favors: ['Gain 2 Reputation and 2 VP'] },
    requires: { servants: ['housekeeper'], guestCount: 2 },
    activityType: 'social',
  },
  {
    id: 'brushing-room',
    name: 'Brushing Room',
    category: 'service',
    expansion: 'base',
    reputationRequired: 1,
    cost: 200,
    level1: { vp: 1, favors: ['Hire a servant at reduced cost'] },
    level2: { vp: 2, favors: ['Hire a servant for free'] },
    requires: { servants: ['footman'], guestCount: 1 },
    activityType: 'social',
    notes: 'Allows Footman to substitute for Valet when a Valet is unavailable.',
  },
  {
    id: 'fox-hunt',
    name: 'Hunting Lodge',
    category: 'sporting',
    expansion: 'base',
    reputationRequired: 3,
    cost: 400,
    level1: { vp: 3, favors: ['Gain £300 and 2 Reputation'] },
    level2: { vp: 5, favors: ['Gain £400 and 3 Reputation', 'Draw guest card'] },
    requires: { servants: ['footman', 'valet'], guestCount: 3, guestGender: 'male' },
    activityType: 'sporting',
    notes: 'Fox Hunt — a prestigious outdoor sporting activity.',
  },
  {
    id: 'morning-room',
    name: 'Morning Room',
    category: 'essential',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £200'] },
    level2: { vp: 3, favors: ['Gain £300 and 1 Reputation'] },
    requires: { servants: ['housekeeper'], guestCount: 2, guestGender: 'female' },
    activityType: 'social',
    notes: 'Morning social for ladies.',
  },
  {
    id: 'political-debate',
    name: 'Club Room',
    category: 'prestige',
    expansion: 'base',
    reputationRequired: 4,
    cost: 500,
    level1: { vp: 4, favors: ['Gain 3 Reputation', 'Draw a prestige guest card'] },
    level2: { vp: 6, favors: ['Gain 4 Reputation', 'Draw 2 prestige guest cards'] },
    requires: { servants: ['butler', 'valet'], guestCount: 3, guestGender: 'male' },
    activityType: 'political',
    notes: 'Political Debate — a prestigious gathering of influential gentlemen.',
  },
  // Monument tiles
  {
    id: 'monument-fountain',
    name: 'Garden Fountain',
    category: 'monument',
    expansion: 'base',
    reputationRequired: 3,
    cost: 600,
    level1: { vp: 4, favors: ['+1 Reputation each round (passive)'] },
    requires: { servants: [] },
    notes: 'Monument — grants +1 Reputation each round passively.',
  },
  {
    id: 'monument-arch',
    name: 'Triumphal Arch',
    category: 'monument',
    expansion: 'base',
    reputationRequired: 4,
    cost: 800,
    level1: { vp: 6, favors: ['+1 Reputation each round (passive)'] },
    requires: { servants: [] },
    notes: 'Monument — grants +1 Reputation each round passively.',
  },
  {
    id: 'south-lawn',
    name: 'South Lawn',
    category: 'sporting',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £200 or 2 Reputation'] },
    level2: { vp: 3, favors: ['Gain £300 and 1 Reputation'] },
    requires: { servants: ['footman'], guestCount: 2 },
    activityType: 'outdoor',
    notes: '2nd Edition hybrid tile — flexible use counting as either Sporting or Estate for Courtship.',
  },
  {
    id: 'green-room',
    name: 'Green Room',
    category: 'service',
    expansion: 'base',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain 1 Reputation and draw a guest'] },
    level2: { vp: 3, favors: ['Gain 2 Reputation and draw 2 guests'] },
    requires: { servants: ['butler'], guestCount: 2 },
    activityType: 'social',
    notes: '2nd Edition hybrid tile — can count as Service or Estate for Courtship scoring.',
  },
];

export const BASE_RULES: RuleSection[] = [
  {
    id: 'overview',
    expansion: 'base',
    title: 'Game Overview',
    content: `Obsession is a 1–4 player deck-building and tile-placement game set in Victorian Derbyshire, England. Players take on the role of the head of a struggling gentry family attempting to restore their estate and social standing.

Over 16 rounds (or 20 in extended play), players host social activities, invite prestigious guests, renovate their country estate, and manage their domestic staff — all in pursuit of reputation and victory points.

The player with the most victory points at game end wins. Victory comes from your estate tiles, guest cards, completed objectives, servants, wealth, courtship wins, and final reputation level.`,
    subsections: [
      {
        id: 'theme',
        expansion: 'base',
        title: 'Setting & Theme',
        content: `Set in 1860s Derbyshire, England — a tribute to the world of Jane Austen and the Victorian era. Players compete to attract the attention of the wealthy and influential Fairchild family: Mr. Charles Fairchild and Miss Elizabeth Fairchild, the most eligible matches in the county.

The game beautifully captures the social dynamics of Victorian England, where reputation, wealth, and strategic social connections determine a family's standing.`,
      },
    ],
  },
  {
    id: 'setup',
    expansion: 'base',
    title: 'Setup',
    content: `1. Place the Supply Board in the center of the table.
2. Separate the Improvement Tiles by category and shuffle each category. Combine them and fill the Builder's Market slots (5 tiles, sorted lowest to highest cost, left to right).
3. Each player chooses a Family Board and takes their starting tiles: Private Study, Butler's Room, Main Gazebo, Front Parlour, and Bowling Green.
4. Each player shuffles their starting Gentry cards and deals 4 to their active hand.
5. Each player takes their family's starting servants.
6. Deal 5 Objective Cards to each player (4 in extended play). Keep these secret.
7. Set the Round Track to Round 1.
8. Shuffle the 10 Theme Cards and 30 VP Cards together to form the Courtship Deck.
9. Determine first player (suggest youngest, or most Victorian-appearing).`,
  },
  {
    id: 'turn-structure',
    expansion: 'base',
    title: 'Turn Structure',
    content: `Each turn proceeds in this order:

**Step 1 — Rotate Servants**
Move all servants one step closer to availability on your player board cooldown track.

**Step 2 — Receive Benefits**
Collect any passive benefits from your estate (e.g., Monument reputation bonuses).

**Step 3 — Trigger Round Events**
Check the Round Track for special round events (Village Fair, Courtship, Builder's Holiday, National Holiday).

**Step 4 — Host Activity OR Pass**
*Host Activity:* Select one Improvement Tile from your estate that you wish to use this turn.
*Pass:* Retrieve your discard pile, reset all servants, and choose to either gain £200 or refresh the Builder's Market. You may also hire servants during a Pass.

**Step 5 — Invite Guests**
Play Gentry cards from your active hand that match the tile's guest requirements.

**Step 6 — Provide Servants**
Deploy available servants from your board to meet the tile's servant requirements.

**Step 7 — Resolve Favours**
Resolve all favour effects from the tile and guest cards (in any order). Some favours are mandatory; some are optional.

**Step 8 — Buy Improvement (Optional)**
Purchase one Improvement Tile from the Builder's Market (pay the cost in money). Exception: Builder's Holiday allows unlimited purchases.`,
  },
  {
    id: 'special-rounds',
    expansion: 'base',
    title: 'Special Rounds',
    content: `**Village Fair** (Rounds 3 & 9 in standard; Rounds 4, 9 & 16 in extended)
Players who have a Private Study in their estate gain £300 and +2 Reputation. A reminder that early investment in essential tiles pays off.

**Courtship Rounds** (Rounds 4, 8, 12, 16 in standard; Rounds 5, 10, 15, 20 in extended)
No normal activities are hosted. Instead:
1. Reveal the top card of the Courtship Deck — this shows the Theme Category.
2. Each player totals the VP value of all Improvement Tiles in their estate matching that category.
3. The player with the highest total wins and chooses one of the two available Fairchild cards.
4. Each Courtship winner also draws one VP Card.
5. Tiebreaker: highest reputation. If still tied: nobody wins the Fairchild card.

**Builder's Holiday** (Round 11 in standard; Round 13 in extended)
Players may purchase as many Improvement Tiles as they can afford this round, instead of the usual limit of one.

**National Holiday** (Round 14 in standard; Round 11 in extended)
All prestige/reputation restrictions are removed this round. Players may host any activity and invite any guest, regardless of reputation requirements. This is often the most memorable turn of the game.`,
  },
  {
    id: 'servants',
    expansion: 'base',
    title: 'Servants & Substitution',
    content: `Each player manages a staff of servant meeples. Servants become unavailable after participating in an activity and must rotate through the cooldown track before returning.

**Base Servant Types:**
- **Butler** — Required for formal and prestigious activities
- **Valet** — Required when male guests are present
- **Lady's Maid** — Required when female guests are present
- **Housekeeper** — Required for dining activities; can substitute for Lady's Maid
- **Footman** — Required for outdoor activities; can substitute for Valet when Brushing Room is in estate
- **Underbutler** — Can substitute for Butler, Valet, or Footman

**Substitution Rules:**
- Housekeeper → Lady's Maid: Always allowed
- Underbutler → Butler, Valet, or Footman: Always allowed
- Footman → Valet: Only when Brushing Room tile is in your estate`,
  },
  {
    id: 'courtship',
    expansion: 'base',
    title: 'Courtship System',
    content: `Courtship is the central competitive mechanic of Obsession. Four times per game, players compete for the favor of Mr. Charles Fairchild and Miss Elizabeth Fairchild.

**Courtship Rounds:**
The 16-round game includes Courtship rounds at Rounds 4, 8, 12, and 16 (the final round).

**How Courtship Works:**
1. A Theme Card is revealed showing a Tile Category (Essential, Service, Estate, Prestige, Sporting, or Monument)
2. Players total VP from matching tiles in their estate tableau
3. Highest total wins a Fairchild card (worth 8 VP + special favours)
4. Winner also draws a VP Card

**Open vs. Closed Courtship Variants:**
- Open (default): Theme card revealed at season start — players can strategize
- Closed (variant): Theme card revealed only during Courtship — more surprise

**Fairchild Cards:**
- Mr. Charles Fairchild: 8 VP, significant reputation boost
- Miss Elizabeth Fairchild: 8 VP, draw additional guest cards`,
  },
  {
    id: 'scoring',
    expansion: 'base',
    title: 'End Game Scoring',
    content: `After Round 16 (or 20 in extended play), players total Victory Points from all sources:

1. **Improvement Tiles** — Sum the VP shown on each tile in your estate (Level 1 or Level 2 side, whichever is face-up)
2. **Gentry Cards** — Sum the VP value of every card in your deck (hand + discard pile)
3. **Objective Cards** — Score each completed Objective Card per its instructions
4. **Servants** — 2 VP per servant on your board
5. **Wealth** — 1 VP per £200 (round down)
6. **VP Cards** — Total the VP shown on any VP Cards won during Courtship
7. **Reputation** — Scales significantly: higher reputation levels are worth exponentially more VP, with maximum reputation worth up to 45 VP

The player with the most total VP wins. In case of a tie, the player with the higher reputation wins. If still tied, the player with more money wins.`,
  },
  {
    id: 'variants',
    expansion: 'base',
    title: 'Game Variants',
    content: `**Extended Play (20 Rounds)**
Deal only 4 Objective Cards per player (instead of 5). Special rounds shift slightly in positioning.

**Open Courtship (Default)**
Theme cards for each season are revealed at the start of that season, allowing players time to plan their tile purchases around upcoming Courtship themes.

**Closed Courtship**
Theme cards are only revealed during the actual Courtship round, adding more surprise and reducing long-term planning.

**Emily Brontë Market Variant**
The Builder's Market is completely reset and repopulated at the start of each new Courtship season, ensuring better tile availability throughout the game.

**Queen Victoria Market Variant**
The cheapest tile in the market is removed at the end of each round. The market gradually shifts toward more expensive and prestigious tiles.

**Solo Play**
One player competes against an AI "automa" opponent using opponent cards and a 20-sided die. The AI's card determines its actions; the player must outscore it across all VP categories.`,
  },
];
