export type Expansion = 'base' | 'wessex' | 'upstairs-downstairs' | 'characters' | 'useful-box' | 'promo';
export type GentryType = 'starter' | 'casual' | 'prestige' | 'family' | 'fairchild';
export type ServantType = 'butler' | 'valet' | 'ladysmaid' | 'housekeeper' | 'footman' | 'underbutler' | 'cook' | 'hallboy' | 'headhousemaid' | 'usefulman';
export type TileCategory = 'essential' | 'service' | 'estate' | 'prestige' | 'sporting' | 'monument';
export type FavorType = 'money' | 'reputation' | 'card' | 'servant' | 'tile' | 'vp' | 'penalty';
export type ActivityType = 'dining' | 'outdoor' | 'formal' | 'leisure' | 'political' | 'sporting' | 'musical' | 'social';

export interface Favor {
  type: FavorType;
  amount?: number;
  description: string;
}

export interface GentryCard {
  id: string;
  name: string;
  type: GentryType;
  expansion: Expansion;
  gender?: 'male' | 'female';
  reputationRequired?: number;
  favors: Favor[];
  vp?: number;
  flavorText?: string;
}

export interface TileRequirement {
  servants: ServantType[];
  guestCount?: number;
  guestGender?: 'male' | 'female' | 'any';
  gentryTypes?: GentryType[];
}

export interface TileSide {
  vp: number;
  favors: string[];
}

export interface ImprovementTile {
  id: string;
  name: string;
  category: TileCategory;
  expansion: Expansion;
  reputationRequired: number;
  cost: number;
  level1: TileSide;
  level2?: TileSide;
  requires: TileRequirement;
  activityType?: ActivityType;
  notes?: string;
}

export interface Family {
  id: string;
  name: string;
  expansion: Expansion;
  startingReputation: number;
  startingMoney: number;
  extraServants?: ServantType[];
  specialBonus: string;
  description: string;
  color: string;
}

export interface ServantDef {
  type: ServantType;
  name: string;
  expansion: Expansion;
  description: string;
  primaryRole: string;
  canSubstituteFor?: ServantType[];
  canBeSubstitutedBy?: ServantType[];
  specialAbility?: string;
}

export interface RuleSection {
  id: string;
  expansion: Expansion | 'all';
  title: string;
  content: string;
  subsections?: RuleSection[];
}

export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  expansion: Expansion | 'all';
  tags: string[];
  source?: string;
}

export interface SortManifest {
  expansion: Expansion;
  label: string;
  color: string;
  gentry: { type: GentryType; count: number; notes?: string }[];
  tiles: { category: TileCategory; count: number; names: string[] }[];
  servants: ServantType[];
  families: string[];
  specialComponents: string[];
}

export type View = 'home' | 'rules' | 'cards' | 'tiles' | 'families' | 'servants' | 'sort' | 'faq' | 'search';
