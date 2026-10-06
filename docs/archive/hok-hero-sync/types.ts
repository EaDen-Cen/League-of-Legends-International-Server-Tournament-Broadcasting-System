import type { Hero } from '../../src/data/heroTypes.js';

export const LANES = ['Clash Lane', 'Jungling', 'Mid Lane', 'Roaming', 'Farm Lane'] as const;
export type Lane = typeof LANES[number];

export interface CatalogHero {
  campId: number;
  englishName: string;
  occupation: Lane;
  imageUrl?: string;
  detailUrl: string;
  source: 'bittopup';
}

export interface OfficialHeroEvidence {
  campId: number;
  englishName?: string;
  chineseName?: string;
  artUrl?: string;
  englishUrl: string;
  chineseUrl: string;
  confirmed: boolean;
}

export interface SourceSnapshot {
  checkedAt: string;
  source: string;
  heroes: CatalogHero[];
}

export interface MatchResult {
  local: Hero;
  remote: CatalogHero;
  matchedBy: 'campId' | 'name' | 'alias';
}

export interface SourceChange {
  campId: number;
  field: 'englishName' | 'occupation' | 'imageUrl' | 'added' | 'missing';
  before?: string;
  after?: string;
}

export interface LocalHeroDifference {
  localId: number;
  campId: number;
  field: 'campId' | 'englishName' | 'occupation';
  localValue?: string;
  remoteValue?: string;
  actionable: boolean;
}

export interface SyncPlan {
  checkedAt: string;
  remoteCount: number;
  matches: MatchResult[];
  additions: CatalogHero[];
  missingLocal: Hero[];
  sourceChanges: SourceChange[];
  localDifferences: LocalHeroDifference[];
  baselineMissing: boolean;
  changed: boolean;
}

export interface AssetRecord {
  heroId: number;
  campId: number;
  sourceUrl: string;
  localPath: string;
  sha256: string;
  mime: string;
  bytes: number;
}

export interface SyncAudit {
  checkedAt: string;
  mode: 'update';
  sources: {
    catalog: string;
    officialEnglishPattern: string;
    officialChinesePattern: string;
  };
  remoteCount: number;
  additions: Array<{
    localId: number;
    campId: number;
    englishName: string;
    chineseName: string;
    occupation: string;
    officialConfirmed: boolean;
  }>;
  metadataOverrides: Array<{
    localId: number;
    campId?: number;
    fields: Record<string, unknown>;
  }>;
  manualReview: string[];
  missingLocalWarnings: string[];
  sourceChanges: SourceChange[];
  localDifferences: LocalHeroDifference[];
  assets: AssetRecord[];
}
