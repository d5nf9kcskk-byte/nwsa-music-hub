import type { GentryCard, RuleSection } from '../types';

export const CHARACTERS_GENTRY: GentryCard[] = [
  // Worker-placement characters
  {
    id: 'constable-bucket',
    name: 'Constable Bucket',
    type: 'prestige',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 2,
    favors: [{ type: 'card', description: 'Remove an unsavoury guest from your hand or tableau' }, { type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 2,
    flavorText: 'A police inspector of formidable deductive ability, invaluable for removing unwanted guests.',
  },
  {
    id: 'mr-higbee',
    name: 'Mr. Higbee',
    type: 'casual',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'servant', description: 'Hire a domestic servant from the supply immediately' }],
    vp: 1,
    flavorText: 'An employment agent who can find domestic help in a pinch.',
  },
  {
    id: 'reverend-grantly',
    name: 'Reverend Grantly',
    type: 'casual',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 2,
    favors: [{ type: 'card', description: 'Exchange an objective card for a new one from the supply' }, { type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 2,
    flavorText: 'An archdeacon dispensing sage advice, and occasionally useful introductions.',
  },
  {
    id: 'dowager-marchioness',
    name: 'Eccentric Dowager Marchioness',
    type: 'prestige',
    expansion: 'characters',
    gender: 'female',
    reputationRequired: 4,
    favors: [{ type: 'card', description: 'Introduce a foreign nobility guest card to the supply or your hand' }, { type: 'vp', amount: 2, description: '2 bonus VP' }],
    vp: 4,
    flavorText: 'Her connections extend to the courts of Europe and beyond.',
  },
  // Distinguished family members
  {
    id: 'distinguished-member-1',
    name: 'The Honourable Frederick Cavendish',
    type: 'family',
    expansion: 'characters',
    gender: 'male',
    favors: [{ type: 'reputation', description: 'Gain 2 reputation' }, { type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 3,
    flavorText: 'A distinguished family member with enhanced abilities over his ordinary counterpart.',
  },
  {
    id: 'distinguished-member-2',
    name: 'Lady Sophia Ponsonby',
    type: 'family',
    expansion: 'characters',
    gender: 'female',
    favors: [{ type: 'card', description: 'Draw 2 guest cards' }, { type: 'reputation', description: 'Gain 1 reputation' }],
    vp: 3,
    flavorText: 'A distinguished family member whose connections are unparalleled.',
  },
  // Sample new prestige guests (20 total)
  {
    id: 'chars-prestige-1',
    name: 'Lady Arabella Forsythe',
    type: 'prestige',
    expansion: 'characters',
    gender: 'female',
    reputationRequired: 3,
    favors: [{ type: 'reputation', description: 'Gain 3 reputation' }, { type: 'money', amount: 200, description: 'Gain £200' }],
    vp: 3,
    flavorText: 'A great beauty who has refused three proposals from earls.',
  },
  {
    id: 'chars-prestige-2',
    name: 'Lord Edmund Blackmore',
    type: 'prestige',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 4,
    favors: [{ type: 'vp', amount: 3, description: '3 bonus VP' }],
    vp: 4,
    flavorText: 'A lord of considerable political influence.',
  },
  {
    id: 'chars-prestige-3',
    name: 'Baroness Von Richter',
    type: 'prestige',
    expansion: 'characters',
    gender: 'female',
    reputationRequired: 5,
    favors: [{ type: 'reputation', description: 'Gain 4 reputation' }, { type: 'card', description: 'Draw a foreign prestige guest' }],
    vp: 5,
    flavorText: 'A Prussian baroness who travels widely and speaks five languages.',
  },
  // Second Chance Servants (as guest cards that introduce them)
  {
    id: 'intoxicated-footman',
    name: 'William (Intoxicated Footman)',
    type: 'casual',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'servant', description: 'Gain use of an extra Footman this turn' }, { type: 'penalty', description: 'Lose 1 reputation (he is rather obvious)' }],
    vp: 1,
    flavorText: 'More enthusiastic than precise. He gets things done, after a fashion.',
  },
  {
    id: 'flirtatious-maid',
    name: 'Millicent (Flirtatious Lady\'s Maid)',
    type: 'casual',
    expansion: 'characters',
    gender: 'female',
    reputationRequired: 1,
    favors: [{ type: 'servant', description: "Gain use of an extra Lady's Maid this turn" }, { type: 'penalty', description: 'Lose 1 reputation (scandalous behaviour observed)' }],
    vp: 1,
    flavorText: 'Her attentions are indiscriminate, which causes no end of trouble.',
  },
  {
    id: 'clumsy-butler',
    name: 'Perkins (Clumsy Butler)',
    type: 'casual',
    expansion: 'characters',
    gender: 'male',
    reputationRequired: 1,
    favors: [{ type: 'servant', description: 'Gain use of an extra Butler this turn' }, { type: 'penalty', description: 'Lose £100 (damaged property)' }],
    vp: 1,
    flavorText: 'Enthusiastic. Willing. Destructive.',
  },
];

export const CHARACTERS_RULES: RuleSection[] = [
  {
    id: 'chars-overview',
    expansion: 'characters',
    title: 'Characters Expansion Overview',
    content: `The Characters expansion introduces true worker placement mechanics through special character cards, Distinguished Family Members who replace ordinary family cards, Second Chance Servants with powerful abilities and consequences, and a new cooperative challenge.

This expansion fundamentally expands the strategic depth of Obsession without replacing any core mechanics, making it suitable for players who are comfortable with the base game.`,
  },
  {
    id: 'chars-worker-placement',
    expansion: 'characters',
    title: 'Worker Placement Characters',
    content: `The Characters expansion introduces four special cards that function as true worker placement pieces, occupying spaces on the board rather than simply providing favours:

**Constable Bucket** — A police inspector who can run off unsavoury guests from any player's hand or tableau (including your own, to refresh your deck).

**Mr. Higbee** — An employment agent who can immediately hire servants from the supply outside of the normal hiring mechanism.

**Reverend Grantly** — A clergyman who allows you to exchange an Objective Card you don't want for a new one from the supply.

**The Eccentric Dowager Marchioness** — Connects players with foreign nobility, introducing international prestige guests into the game.`,
  },
  {
    id: 'chars-distinguished',
    expansion: 'characters',
    title: 'Distinguished Family Members',
    content: `Each player may optionally replace 1 or 2 of their ordinary family members with Distinguished Family Members from the Characters expansion.

Distinguished Family Members have the same family crest but offer enhanced favours compared to their ordinary counterparts. They are worth more victory points and provide better abilities, but they must be selected at game setup and cannot be swapped during play.

Consider carefully which ordinary family members to replace — the base cards serve specific roles, and Distinguished replacements may shift your strategic priorities.`,
  },
  {
    id: 'chars-second-chance',
    expansion: 'characters',
    title: 'Second Chance Servants',
    content: `Second Chance Servants are staff members with personal quirks — intoxicated, flirtatious, or clumsy — who can be hired to fill servant roles in a pinch.

These servants allow you to host activities that would otherwise be impossible due to servant unavailability, but they come with consequences:
- **Intoxicated servants** cause reputation penalties
- **Flirtatious servants** cause reputation or relationship scandals
- **Clumsy servants** cause property damage (money penalties)

The strategic question is whether the activity's benefits outweigh the Second Chance Servant's penalties.`,
  },
  {
    id: 'chars-cooperative',
    expansion: 'characters',
    title: 'Cooperative Challenge',
    content: `The Characters expansion introduces a malevolent cooperative challenge: the disreputable Sneyd family has leveraged newly ill-gotten wealth in a quest to form an alliance with the Fairchilds of Alderley Hall.

Players must band together to prevent this alliance by outscoring the Sneyd AI across all victory point categories. The Sneyd family's Dynamic AI ensures different strategies and difficulty levels each game.

The 52-card objective deck (22 new objectives from Characters expansion) permanently replaces the two previous objective decks, providing greater variety in both standard and cooperative play.`,
  },
];
