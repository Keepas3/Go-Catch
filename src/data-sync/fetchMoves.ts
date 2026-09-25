import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { PveMoveStats } from "./types.js";

// PvPoke only carries PvP move stats (different power/energy/duration than raids
// and gyms use). PvE move stats come from Niantic's actual GAME_MASTER, mirrored
// openly and updated regularly by the community here -- no auth, no key.
// Credit: https://github.com/PokeMiners/game_masters
const GAME_MASTER_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json";

interface GameMasterTemplate {
  templateId: string;
  data?: {
    moveSettings?: {
      movementId: string;
      pokemonType?: string;
      power?: number;
      durationMs?: number;
      energyDelta?: number;
    };
  };
}

/**
 * Fetches the full ~20MB Niantic game master and extracts just the PvE move
 * stats (power/duration/energy per move) into a small keyed map, discarding
 * everything else (items, quests, PvP-specific templates, etc.) before caching.
 */
export async function fetchMoves(cacheDir: string): Promise<Record<string, PveMoveStats>> {
  const res = await fetch(GAME_MASTER_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch game master: ${res.status} ${res.statusText}`);
  }
  const templates = (await res.json()) as GameMasterTemplate[];

  const moves: Record<string, PveMoveStats> = {};
  for (const t of templates) {
    const ms = t.data?.moveSettings;
    if (!ms?.movementId) continue;
    moves[ms.movementId] = {
      moveId: ms.movementId,
      type: (ms.pokemonType ?? "").replace("POKEMON_TYPE_", "").toLowerCase(),
      power: ms.power ?? 0,
      durationMs: ms.durationMs ?? 0,
      energyDelta: ms.energyDelta ?? 0,
    };
  }

  await writeFile(path.join(cacheDir, "raw-moves.json"), JSON.stringify(moves, null, 2));
  return moves;
}
