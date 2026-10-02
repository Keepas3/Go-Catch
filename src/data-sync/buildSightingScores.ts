import { createScorer } from "./computeScores.js";
import type {
  CuratedOverride,
  PveMoveStats,
  PvPokeGamemasterPokemon,
  PvPokeRankingEntry,
  PvpLeague,
  RankedSpecies,
} from "./types.js";

// What the browser needs to show a logged sighting's worth. PvP IV/moveset
// detail isn't displayed for sightings, so it's left out to keep the file small.
export type SightingScoreRecord = Pick<
  RankedSpecies,
  | "speciesId"
  | "speciesName"
  | "dex"
  | "types"
  | "pvp"
  | "raidAttacker"
  | "gymDefender"
  | "stardust"
  | "moveset"
  | "bestCategory"
  | "verdict"
> & { key: string };

/**
 * Pre-scores every released species so the static site can show a sighting's
 * worth with no server. Order matters: it is the same longest-name-first order
 * `buildSpeciesMatcher` uses, and the browser takes the first whole-word match.
 */
export function buildSightingScores(
  gamemaster: PvPokeGamemasterPokemon[],
  rankings: Record<PvpLeague, PvPokeRankingEntry[]>,
  overrides: CuratedOverride[],
  moves: Record<string, PveMoveStats>,
): SightingScoreRecord[] {
  const scorer = createScorer(gamemaster, rankings, overrides, moves);
  const sorted = [...gamemaster]
    .filter((p) => p.released !== false)
    .sort((a, b) => b.speciesName.length - a.speciesName.length);

  const seen = new Set<string>();
  const records: SightingScoreRecord[] = [];
  for (const p of sorted) {
    const key = p.speciesName.toLowerCase();
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);

    const scored = scorer.scoreEntry({
      rawName: p.speciesName,
      speciesId: p.speciesId,
      speciesName: p.speciesName,
      dex: p.dex,
      types: p.types,
      canBeShiny: false,
      sources: [],
      stardustBonusDetail: null,
      nextEventStart: null,
    });

    records.push({
      key,
      speciesId: scored.speciesId,
      speciesName: scored.speciesName,
      dex: scored.dex,
      types: scored.types,
      pvp: scored.pvp,
      raidAttacker: scored.raidAttacker,
      gymDefender: scored.gymDefender,
      stardust: scored.stardust,
      moveset: scored.moveset,
      bestCategory: scored.bestCategory,
      verdict: scored.verdict,
    });
  }
  return records;
}
