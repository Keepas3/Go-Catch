// Shapes for the raw feeds we pull from ScrapedDuck (LeekDuck mirror) and PvPoke.
// Only the fields we actually use are declared.

export interface LeekDuckRaidBoss {
  name: string;
  tier: string;
  canBeShiny: boolean;
  types: { name: string }[];
  combatPower: { normal: { min: number; max: number }; boosted?: { min: number; max: number } };
  image: string;
}

export interface LeekDuckEgg {
  name: string;
  eggType: string;
  isAdventureSync: boolean;
  canBeShiny: boolean;
  isRegional: boolean;
  isGiftExchange: boolean;
  rarity: number;
  image: string;
}

export interface LeekDuckResearchReward {
  name: string;
  canBeShiny: boolean;
  image: string;
}

export interface LeekDuckResearchTask {
  text: string;
  rewards: LeekDuckResearchReward[];
  type?: string;
}

export interface LeekDuckEvent {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  start: string;
  end: string;
  extraData: Record<string, unknown>;
}

export interface PvPokeGamemasterPokemon {
  dex: number;
  speciesName: string;
  speciesId: string;
  baseStats: { atk: number; def: number; hp: number };
  types: string[];
  released?: boolean;
  family?: { id: string; parent?: string; evolutions?: string[] };
  tags?: string[]; // includes "mega" for both Mega Evolutions and Primal Reversions
  fastMoves?: string[];
  chargedMoves?: string[];
  eliteMoves?: string[]; // moves from fastMoves/chargedMoves that need an Elite TM (or are otherwise limited-availability)
  defaultIVs?: Record<string, number[]>; // e.g. cp1500: [level, atkIV, defIV, staIV] -- PvPoke's rank-#1 IV spread per CP cap
}

export interface IdealIVs {
  level: number;
  atk: number;
  def: number;
  sta: number;
}

export interface PvPokeGamemaster {
  pokemon: PvPokeGamemasterPokemon[];
}

// PvE (raid/gym) move stats from Niantic's actual GAME_MASTER -- distinct from
// PvPoke's PvP-only move balance numbers for the same move.
export interface PveMoveStats {
  moveId: string;
  type: string; // lowercased, e.g. "grass"
  power: number;
  durationMs: number;
  energyDelta: number; // positive (gain) for fast moves, negative (cost) for charged moves
}

export interface PvPokeRankingEntry {
  speciesId: string;
  speciesName: string;
  rating: number; // 0-1000 overall meta rating
  score: number; // 0-100 normalized score used for display
  moveset?: string[]; // PvPoke's recommended PvP moveset: [fastMoveId, chargedMoveId1, chargedMoveId2]
}

export interface PvpMoveset {
  fastMove: string;
  chargedMoves: string[];
}

export type PvpLeague = "great" | "ultra" | "master";

export interface CuratedOverride {
  speciesId: string;
  speciesName: string;
  raidAttackerTier?: 1 | 2 | 3 | 4 | 5;
  gymDefenderTier?: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

export type SourceTag =
  | { type: "raid"; detail: string } // e.g. "5-Star Raid"
  | { type: "egg"; detail: string } // e.g. "5 km Egg"
  | { type: "research"; detail: string } // e.g. "Field Research"
  | { type: "spawn"; detail: string } // e.g. "Community Day: Zorua"
  | { type: "spotlight"; detail: string };

export interface SpawnPoolEntry {
  rawName: string; // exact string as it appeared on LeekDuck
  speciesId: string | null; // resolved PvPoke speciesId, if matched
  speciesName: string | null; // resolved canonical species name, if matched
  dex: number | null; // national dex number, if matched -- used to build sprite URLs
  types: string[]; // e.g. ["fire", "flying"], if matched
  canBeShiny: boolean;
  sources: SourceTag[];
  stardustBonusDetail: string | null; // set when a live Community Day/Spotlight Hour bonus grants extra stardust for catching this species
  nextEventStart: string | null; // earliest Community Day/Spotlight Hour start (ISO), for sorting wildEncounters chronologically
}

export interface CategoryScore {
  score: number; // 0-100, higher = more worth catching for this category
  tier: 1 | 2 | 3 | 4 | 5; // 1 = best
  reason: string;
}

export type CategoryKey = "pvp" | "raidAttacker" | "gymDefender" | "stardust";

export type Verdict = "Must Catch" | "Worth Catching" | "Situational" | "Skip / Dex Only";

export interface RankedSpecies {
  rawName: string;
  speciesId: string | null;
  speciesName: string;
  dex: number | null;
  types: string[];
  canBeShiny: boolean;
  sources: SourceTag[];
  pvp: (CategoryScore & { league: PvpLeague }) | null;
  pvpByLeague: Record<PvpLeague, CategoryScore | null>; // score within each specific league, for the per-league PvP tab
  pvpIVs: Record<PvpLeague, IdealIVs | null>; // ideal IV spread + level for whichever evolution won that league's score
  pvpMoveset: Record<PvpLeague, PvpMoveset | null>; // PvPoke's recommended fast + up-to-2-charged-move loadout per league
  raidAttacker: CategoryScore | null;
  gymDefender: CategoryScore | null;
  stardust: CategoryScore | null;
  moveset: { fastMove: string; chargedMove: string; type: string }[]; // up to 2: best STAB pick + a different-type coverage alternative
  stardustBonusDetail: string | null;
  nextEventStart: string | null;
  categoriesHit: number;
  bestCategory: { key: CategoryKey; score: number; tier: 1 | 2 | 3 | 4 | 5 } | null;
  verdict: Verdict;
}

export interface NewsItem {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  start: string;
  end: string;
  status: "live" | "upcoming" | "ended";
}

export interface ScoreboardOutput {
  generatedAt: string;
  attribution: string[];
  raid: RankedSpecies[];
  gymDefense: RankedSpecies[];
  pvp: Record<PvpLeague, RankedSpecies[]>; // ranked separately per league -- a species can appear in more than one
  stardust: RankedSpecies[];
  notable: RankedSpecies[]; // ranks well in 2+ categories
  wildEncounters: RankedSpecies[]; // currently obtainable via event/spotlight/community-day wild spawns
  raidBosses: RankedSpecies[]; // currently obtainable via raids, grouped/sorted for "should I spend a raid pass on this"
  news: { upcoming: NewsItem[]; recent: NewsItem[] };
}
