import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScorer } from "../data-sync/computeScores.js";
import { buildSpeciesMatcher } from "../data-sync/normalize.js";
import type { CuratedOverride, PveMoveStats, PvPokeGamemasterPokemon, PvPokeRankingEntry, PvpLeague, RankedSpecies } from "../data-sync/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

export type SightingScore =
  | (Pick<
      RankedSpecies,
      | "speciesId"
      | "speciesName"
      | "dex"
      | "types"
      | "pvp"
      | "pvpIVs"
      | "pvpMoveset"
      | "raidAttacker"
      | "gymDefender"
      | "stardust"
      | "moveset"
      | "bestCategory"
      | "verdict"
    > & { resolved: true })
  | { resolved: false };

/**
 * Scores a manually-logged sighting the same way the sync pipeline scores the
 * live spawn pool (same evolution-aware PvP/raid/defense logic), reading
 * whatever the last `npm run sync` produced -- no separate "worth" calculation
 * to keep in sync.
 */
export async function scoreSighting(speciesName: string, canBeShiny: boolean): Promise<SightingScore> {
  const [gamemaster, rankings, overrides, moves] = await Promise.all([
    readJson<PvPokeGamemasterPokemon[]>(path.join(root, "cache", "raw-gamemaster.json")),
    readJson<Record<PvpLeague, PvPokeRankingEntry[]>>(path.join(root, "cache", "raw-rankings.json")),
    readJson<CuratedOverride[]>(path.join(root, "src", "data-sync", "curatedOverrides.json")),
    readJson<Record<string, PveMoveStats>>(path.join(root, "cache", "raw-moves.json")).catch(() => ({})),
  ]);

  const resolve = buildSpeciesMatcher(gamemaster);
  const match = resolve(speciesName);
  if (!match) return { resolved: false };

  const scorer = createScorer(gamemaster, rankings, overrides, moves);
  const scored = scorer.scoreEntry({
    rawName: speciesName,
    speciesId: match.speciesId,
    speciesName: match.speciesName,
    dex: match.dex,
    types: match.types,
    canBeShiny,
    sources: [],
    stardustBonusDetail: null, // a manual sighting isn't tied to a specific live event's bonus tracking
    nextEventStart: null,
  });

  return {
    resolved: true,
    speciesId: scored.speciesId,
    speciesName: scored.speciesName,
    dex: scored.dex,
    types: scored.types,
    pvp: scored.pvp,
    pvpIVs: scored.pvpIVs,
    pvpMoveset: scored.pvpMoveset,
    raidAttacker: scored.raidAttacker,
    gymDefender: scored.gymDefender,
    stardust: scored.stardust,
    moveset: scored.moveset,
    bestCategory: scored.bestCategory,
    verdict: scored.verdict,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}
