import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLeekDuckFeeds } from "./fetchLeekDuck.js";
import { fetchPvPokeFeeds } from "./fetchPvPoke.js";
import { fetchMoves } from "./fetchMoves.js";
import { buildSpawnPool } from "./buildSpawnPool.js";
import { buildNews } from "./buildNews.js";
import { computeScores } from "./computeScores.js";
import { buildSightingScores } from "./buildSightingScores.js";
import type { CuratedOverride, PvpLeague, RankedSpecies, ScoreboardOutput } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "..", "..", "cache");

function topN(list: RankedSpecies[], key: "pvp" | "raidAttacker" | "gymDefender" | "stardust", n = 30) {
  return [...list]
    .filter((s) => s[key] !== null)
    .sort((a, b) => (b[key]!.score ?? 0) - (a[key]!.score ?? 0))
    .slice(0, n);
}

// A species is ranked independently within each league -- if it's top-25 in both
// Great and Ultra, it shows up in both lists, since that's a genuinely different
// question ("is this good in Great League?") than a single flattened "best PvP
// pick overall" ranking would answer.
function topNByLeague(list: RankedSpecies[], league: PvpLeague, n = 25): RankedSpecies[] {
  return [...list]
    .filter((s) => s.pvpByLeague[league] !== null)
    .sort((a, b) => b.pvpByLeague[league]!.score - a.pvpByLeague[league]!.score)
    .slice(0, n);
}

async function main() {
  await mkdir(cacheDir, { recursive: true });

  console.log("Fetching LeekDuck feeds (raids/eggs/research/events) via ScrapedDuck...");
  const leekDuck = await fetchLeekDuckFeeds(cacheDir);

  console.log("Fetching PvPoke gamemaster + rankings...");
  const pvpoke = await fetchPvPokeFeeds(cacheDir);

  console.log("Fetching real PvE move stats (raid/gym DPS) from Niantic's game master mirror...");
  const moves = await fetchMoves(cacheDir);
  console.log(`  -> ${Object.keys(moves).length} moves`);

  console.log("Building current spawn pool...");
  const pool = buildSpawnPool(leekDuck, pvpoke.gamemaster);
  console.log(`  -> ${pool.length} distinct species currently obtainable`);

  const overridesRaw = await readFile(path.join(__dirname, "curatedOverrides.json"), "utf-8");
  const overrides: CuratedOverride[] = JSON.parse(overridesRaw);

  console.log("Scoring...");
  const scored = computeScores(pool, pvpoke.gamemaster, pvpoke.rankings, overrides, moves);

  const notable = scored.filter((s) => s.categoriesHit >= 2).sort((a, b) => b.categoriesHit - a.categoriesHit);

  const byBestScore = (a: RankedSpecies, b: RankedSpecies) => (b.bestCategory?.score ?? 0) - (a.bestCategory?.score ?? 0);

  // Soonest-happening first -- this is a "what's coming up" list, not a worth ranking.
  const wildEncounters = scored
    .filter((s) => s.sources.some((src) => src.type === "spawn" || src.type === "spotlight"))
    .sort((a, b) => (a.nextEventStart ?? "").localeCompare(b.nextEventStart ?? ""));

  const raidBosses = scored.filter((s) => s.sources.some((src) => src.type === "raid")).sort(byBestScore);

  const news = buildNews(leekDuck.events);

  const output: ScoreboardOutput = {
    generatedAt: new Date().toISOString(),
    attribution: [
      "Raid/egg/research/event data via ScrapedDuck (github.com/bigfoott/ScrapedDuck), sourced from LeekDuck.com",
      "PvP rankings and species data via PvPoke (github.com/pvpoke/pvpoke, pvpoke.com)",
      "Raid/gym move stats via PokeMiners' Game Master mirror (github.com/PokeMiners/game_masters)",
    ],
    raid: topN(scored, "raidAttacker"),
    gymDefense: topN(scored, "gymDefender"),
    pvp: {
      great: topNByLeague(scored, "great"),
      ultra: topNByLeague(scored, "ultra"),
      master: topNByLeague(scored, "master"),
    },
    stardust: topN(scored, "stardust"),
    notable,
    wildEncounters,
    raidBosses,
    news,
  };

  const sightingScores = buildSightingScores(pvpoke.gamemaster, pvpoke.rankings, overrides, moves);
  await writeFile(path.join(cacheDir, "sighting-scores.json"), JSON.stringify(sightingScores));
  console.log(`  -> pre-scored ${sightingScores.length} species for the sightings log`);

  await writeFile(path.join(cacheDir, "scoreboard.json"), JSON.stringify(output, null, 2));
  console.log(`Done. Wrote ${path.join(cacheDir, "scoreboard.json")}`);
  console.log(
    `  raid=${output.raid.length} gymDefense=${output.gymDefense.length} pvp.great=${output.pvp.great.length} pvp.ultra=${output.pvp.ultra.length} pvp.master=${output.pvp.master.length} stardust=${output.stardust.length} notable=${output.notable.length} wildEncounters=${output.wildEncounters.length} raidBosses=${output.raidBosses.length} news.upcoming=${output.news.upcoming.length} news.recent=${output.news.recent.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
