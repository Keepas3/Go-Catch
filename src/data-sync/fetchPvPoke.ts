import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { PvPokeGamemaster, PvPokeGamemasterPokemon, PvPokeRankingEntry, PvpLeague } from "./types.js";

// PvPoke is an open-source PvP battle simulator/ranker. We read its precomputed
// "overall" rankings per league plus its gamemaster (species/stat) dataset.
// Credit: https://github.com/pvpoke/pvpoke and https://pvpoke.com
const BASE = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data";

const LEAGUE_FILES: Record<PvpLeague, string> = {
  great: "rankings/all/overall/rankings-1500.json",
  ultra: "rankings/all/overall/rankings-2500.json",
  master: "rankings/all/overall/rankings-10000.json",
};

async function fetchJson<T>(relativePath: string): Promise<T> {
  const res = await fetch(`${BASE}/${relativePath}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${relativePath}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface PvPokeRawFeeds {
  gamemaster: PvPokeGamemasterPokemon[];
  rankings: Record<PvpLeague, PvPokeRankingEntry[]>;
}

export async function fetchPvPokeFeeds(cacheDir: string): Promise<PvPokeRawFeeds> {
  const [gamemasterRaw, great, ultra, master] = await Promise.all([
    fetchJson<PvPokeGamemaster | PvPokeGamemasterPokemon[]>("gamemaster.json"),
    fetchJson<PvPokeRankingEntry[]>(LEAGUE_FILES.great),
    fetchJson<PvPokeRankingEntry[]>(LEAGUE_FILES.ultra),
    fetchJson<PvPokeRankingEntry[]>(LEAGUE_FILES.master),
  ]);

  // pvpoke has changed the top-level shape of gamemaster.json between versions
  // (bare array vs { pokemon: [...] }); support both defensively.
  const gamemaster = Array.isArray(gamemasterRaw) ? gamemasterRaw : gamemasterRaw.pokemon;

  const rankings: Record<PvpLeague, PvPokeRankingEntry[]> = { great, ultra, master };

  await Promise.all([
    writeFile(path.join(cacheDir, "raw-gamemaster.json"), JSON.stringify(gamemaster, null, 2)),
    writeFile(path.join(cacheDir, "raw-rankings.json"), JSON.stringify(rankings, null, 2)),
  ]);

  return { gamemaster, rankings };
}
