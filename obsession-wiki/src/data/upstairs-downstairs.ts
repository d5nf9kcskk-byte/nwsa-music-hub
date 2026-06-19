import type { Family, GentryCard, ImprovementTile, RuleSection } from '../types';

export const HOWARD_FAMILY: Family = {
  id: 'howard',
  name: 'Howard',
  expansion: 'upstairs-downstairs',
  startingReputation: 1,
  startingMoney: 0,
  extraServants: ['cook'],
  specialBonus: 'Servant-focused gameplay; starts with extra Cook whose abilities are enhanced for the Howard family',
  description: 'The Howard family is renowned for the talent of their domestic staff. Their unique relationship with the Cook unlocks activities and guests normally beyond their station, making servant management even more critical for this family.',
  color: '#1a2a5c',
};

export const UD_GENTRY: GentryCard[] = [
  {
    id: 'ud-casual-1',
    name: 'Mrs. Henrietta Barlow',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    reputationRequired: 1,
    favors: [{ type: 'servant', description: 'Your Cook gains an additional use this turn' }],
    vp: 1,
    flavorText: 'A celebrated cook herself, she always appreciates a well-managed kitchen.',
  },
  {
    id: 'ud-casual-2',
    name: 'Mr. Cornelius Plum',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 1,
    flavorText: 'A retired tradesman who made his fortune in colonial spices.',
  },
  {
    id: 'ud-casual-3',
    name: 'Miss Arabella Church',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    reputationRequired: 2,
    favors: [{ type: 'reputation', description: 'Gain 2 reputation' }],
    vp: 2,
    flavorText: 'The daughter of a bishop, she moves in the highest clerical circles.',
  },
  {
    id: 'ud-casual-4',
    name: 'Mr. Algernon Wetherby',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 2,
    favors: [{ type: 'card', description: 'Draw 2 guest cards' }],
    vp: 2,
    flavorText: 'An insurance man of surprising social ambition.',
  },
  {
    id: 'ud-casual-5',
    name: 'Widow Millicent Hare',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    reputationRequired: 2,
    favors: [{ type: 'money', amount: 300, description: 'Gain £300' }, { type: 'penalty', description: 'Lose 1 reputation (her scandals follow her)' }],
    vp: 2,
    flavorText: 'A wealthy widow of somewhat dubious reputation.',
  },
  {
    id: 'ud-casual-6',
    name: 'Mr. Benedict Cross',
    type: 'casual',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 3,
    favors: [{ type: 'reputation', description: 'Gain 2 reputation' }, { type: 'money', amount: 100, description: 'Gain £100' }],
    vp: 2,
    flavorText: 'A rising barrister with political aspirations.',
  },
  {
    id: 'ud-prestige-1',
    name: 'Lord Archibald Frome',
    type: 'prestige',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 3,
    favors: [{ type: 'reputation', description: 'Gain 3 reputation' }, { type: 'card', description: 'Draw a prestige guest card' }],
    vp: 3,
    flavorText: 'A peer whose judgment in matters of taste is considered impeccable.',
  },
  {
    id: 'ud-prestige-2',
    name: 'Viscountess of Stowe',
    type: 'prestige',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    reputationRequired: 4,
    favors: [{ type: 'money', amount: 400, description: 'Gain £400' }, { type: 'reputation', description: 'Gain 2 reputation' }],
    vp: 4,
    flavorText: 'Her connections span from Whitehall to Windsor.',
  },
  {
    id: 'ud-prestige-3',
    name: 'Bishop of Chatsworth',
    type: 'prestige',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 4,
    favors: [{ type: 'vp', amount: 2, description: '2 bonus VP' }, { type: 'reputation', description: 'Gain 3 reputation' }],
    vp: 4,
    flavorText: 'A man of the cloth whose approval carries both spiritual and social weight.',
  },
  {
    id: 'ud-prestige-4',
    name: 'Baroness Evangeline St. Clare',
    type: 'prestige',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    reputationRequired: 5,
    favors: [{ type: 'reputation', description: 'Gain 5 reputation' }],
    vp: 5,
    flavorText: 'One of the great hostesses of the age, now deigning to visit your modest estate.',
  },
  {
    id: 'ud-prestige-5',
    name: 'Duke of Northfield',
    type: 'prestige',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    reputationRequired: 6,
    favors: [{ type: 'vp', amount: 4, description: '4 bonus VP' }, { type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 6,
    flavorText: 'A duke of the highest standing, his visit is the talk of the county.',
  },
  {
    id: 'howard-lord',
    name: 'Lord Howard',
    type: 'family',
    expansion: 'upstairs-downstairs',
    gender: 'male',
    favors: [{ type: 'servant', description: 'Recover one servant from cooldown' }],
    vp: 2,
  },
  {
    id: 'howard-lady',
    name: 'Lady Howard',
    type: 'family',
    expansion: 'upstairs-downstairs',
    gender: 'female',
    favors: [{ type: 'reputation', description: 'Gain 2 reputation' }],
    vp: 2,
  },
];

export const UD_TILES: ImprovementTile[] = [
  {
    id: 'servants-hall',
    name: "Servants' Hall",
    category: 'service',
    expansion: 'upstairs-downstairs',
    reputationRequired: 1,
    cost: 200,
    level1: { vp: 2, favors: ['Hire 2 servants at reduced cost', 'Recover 1 servant from cooldown'] },
    level2: { vp: 3, favors: ['Hire 2 servants for free', 'Recover 2 servants from cooldown'] },
    requires: { servants: ['butler'], guestCount: 1 },
    activityType: 'social',
    notes: 'Upstairs/Downstairs expansion — excellent servant management tile.',
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    category: 'service',
    expansion: 'upstairs-downstairs',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £200 and 2 Reputation (Cook provides enhanced bonus)'] },
    level2: { vp: 4, favors: ['Gain £300 and 3 Reputation', 'Draw a guest card'] },
    requires: { servants: ['cook', 'housekeeper'], guestCount: 2 },
    activityType: 'dining',
    notes: 'Pairs powerfully with the Cook servant and the Howard family.',
  },
  {
    id: 'laundry',
    name: 'Laundry Room',
    category: 'service',
    expansion: 'upstairs-downstairs',
    reputationRequired: 1,
    cost: 200,
    level1: { vp: 1, favors: ['Recover all servants from cooldown'] },
    level2: { vp: 2, favors: ['Recover all servants from cooldown', 'Gain £100'] },
    requires: { servants: ['headhousemaid'], guestCount: 1 },
    activityType: 'social',
    notes: 'Powerful servant recovery tile — pairs well with Head Housemaid.',
  },
  {
    id: 'croquet-lawn',
    name: 'Croquet Lawn',
    category: 'sporting',
    expansion: 'upstairs-downstairs',
    reputationRequired: 2,
    cost: 300,
    level1: { vp: 2, favors: ['Gain £200 and 1 Reputation'] },
    level2: { vp: 4, favors: ['Gain £300 and 2 Reputation'] },
    requires: { servants: ['footman'], guestCount: 2 },
    activityType: 'sporting',
    notes: 'Upstairs/Downstairs sporting tile.',
  },
  {
    id: 'studio',
    name: "Artist's Studio",
    category: 'estate',
    expansion: 'upstairs-downstairs',
    reputationRequired: 3,
    cost: 400,
    level1: { vp: 3, favors: ['Gain 2 Reputation', 'Draw 2 guest cards'] },
    level2: { vp: 5, favors: ['Gain 3 Reputation', 'Draw 3 guest cards'] },
    requires: { servants: ['ladysmaid'], guestCount: 2, guestGender: 'female' },
    activityType: 'social',
    notes: 'Upstairs/Downstairs artistic gathering.',
  },
];

export const UD_RULES: RuleSection[] = [
  {
    id: 'ud-overview',
    expansion: 'upstairs-downstairs',
    title: 'Upstairs, Downstairs Overview',
    content: `The Upstairs, Downstairs expansion adds substantial depth to Obsession by introducing a sixth playable family (Howard), four new servant types, 49 additional guests, new improvement tiles, milestones, and three new game modes.

The Howard family's servant-focused gameplay offers a significantly different experience from the base four families, making this expansion an excellent introduction to deeper Obsession strategy.`,
  },
  {
    id: 'ud-servants',
    expansion: 'upstairs-downstairs',
    title: 'New Servant Types',
    content: `**Cook**
Perhaps the most powerful new servant. The Cook allows the hosting of dining activities and inviting guests that would normally be beyond your reputation reach. For the Howard family, the Cook provides additional bonuses beyond the standard effects.

**Hall Boy**
A junior male servant who increases monetary favours from any activity he supports. He can also fill in for a Butler or Footman when needed, adding flexibility to your staff.

**Head Housemaid**
A senior female domestic who provides a unique card-management ability: she allows you to screen Guest cards before drawing, letting you avoid unwanted cards and build a more focused deck.

**Useful Man**
A versatile odd-job man whose exact abilities depend on the activity. He provides unique benefits that don't fit neatly into other servant categories.`,
  },
  {
    id: 'ud-modes',
    expansion: 'upstairs-downstairs',
    title: 'New Game Modes',
    content: `**Solo Estate Challenge**
A campaign-style solo mode where you track your estate improvements across multiple gaming sessions, competing against your own personal bests.

**Tableau Obsession**
A variant that emphasizes estate tableau building, rewarding players who create synergistic combinations of improvement tiles.

**Cooperative Obsession**
All players work together against the rising Sneyd family AI antagonist. The disreputable Sneyd family has acquired ill-gotten wealth and seeks to form an alliance with the Fairchilds of Alderley Hall. Players must prevent this by outscoring the Sneyd AI across all victory point categories.

The Sneyd family is controlled by a Dynamic AI system with different personalities and strategies each game, ensuring no two cooperative sessions are the same.`,
  },
  {
    id: 'ud-milestones',
    expansion: 'upstairs-downstairs',
    title: 'Milestones',
    content: `Milestones are public objectives that any player can complete during the game. Two milestone cards are selected at setup and placed face-up where all players can see them.

Unlike private Objective Cards, Milestones are known to all players from the start, creating additional competitive tension as players race to complete them.

Examples of Milestones:
- "First player to have 5 improvement tiles in their estate"
- "First player to host an activity with 4 or more guests"
- "First player to hire all 4 expansion servant types"

Completing a milestone grants a specified bonus (usually VP or resources).`,
  },
];
