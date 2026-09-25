import type {
  CategoryScore,
  CuratedOverride,
  IdealIVs,
  PveMoveStats,
  PvPokeGamemasterPokemon,
  PvPokeRankingEntry,
  PvpLeague,
  PvpMoveset,
  RankedSpecies,
  SpawnPoolEntry,
} from "./types.js";

const LEAGUES: PvpLeague[] = ["great", "ultra", "master"];
const STAB_MULTIPLIER = 1.2;

interface MovesetResult {
  dps: number;
  fastMoveId: string;
  chargedMoveId: string;
  chargedType: string;
  fastIsElite: boolean;
  chargedIsElite: boolean;
}

interface MovesetOptions {
  standard: MovesetResult | null; // best moveset using only moves a newly-caught Pokemon can actually have
  overall: MovesetResult | null; // best moveset if Elite TM moves are included too
  topByType: MovesetResult[]; // up to 2 best standard movesets with distinct charged-move types (STAB pick + a coverage alternative)
}

function resolveMove(id: string, isFast: boolean, moves: Record<string, PveMoveStats>): PveMoveStats | undefined {
  // Niantic's internal move IDs append "_FAST" to fast moves; PvPoke's move lists don't.
  return moves[id] ?? (isFast ? moves[`${id}_FAST`] : undefined);
}

function friendlyMoveName(moveId: string): string {
  return moveId
    .replace(/_FAST$/, "")
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Finds the highest-DPS fast+charged moveset for a species using real PvE move
 * stats (power/energy/duration), applying STAB when the move's type matches one
 * of the Pokemon's own types. This is the standard raid-DPS cycle formula: how
 * many fast moves it takes to charge the charged move, plus the charged move
 * itself, divided by the total time that takes.
 *
 * Computed twice: "standard" only considers moves that don't need an Elite TM
 * (what a newly-caught Pokemon can actually have), and "overall" also allows
 * Elite TM moves. Scoring uses "standard" by default -- a Pokemon whose only
 * good moveset is Elite-TM-locked (e.g. Regigigas' Crush Grip) shouldn't be
 * rated as if every catch has it.
 */
function bestMovesets(p: PvPokeGamemasterPokemon, moves: Record<string, PveMoveStats>): MovesetOptions {
  const eliteSet = new Set(p.eliteMoves ?? []);
  let standard: MovesetResult | null = null;
  let overall: MovesetResult | null = null;
  const bestByChargedType = new Map<string, MovesetResult>();

  for (const fastId of p.fastMoves ?? []) {
    const fast = resolveMove(fastId, true, moves);
    if (!fast || fast.durationMs <= 0 || fast.energyDelta <= 0) continue;
    const fastIsElite = eliteSet.has(fastId);

    for (const chargedId of p.chargedMoves ?? []) {
      const charged = resolveMove(chargedId, false, moves);
      if (!charged || charged.durationMs <= 0 || charged.energyDelta >= 0) continue;
      const chargedIsElite = eliteSet.has(chargedId);

      const stabFast = p.types.includes(fast.type) ? STAB_MULTIPLIER : 1;
      const stabCharged = p.types.includes(charged.type) ? STAB_MULTIPLIER : 1;
      const energyCost = -charged.energyDelta;
      const numFast = energyCost / fast.energyDelta;
      const cycleDamage = numFast * fast.power * stabFast + charged.power * stabCharged;
      const cycleTimeSeconds = (numFast * fast.durationMs + charged.durationMs) / 1000;
      const dps = cycleDamage / cycleTimeSeconds;

      const result: MovesetResult = {
        dps,
        fastMoveId: fastId,
        chargedMoveId: chargedId,
        chargedType: charged.type,
        fastIsElite,
        chargedIsElite,
      };

      if (!overall || dps > overall.dps) overall = result;
      if (!fastIsElite && !chargedIsElite) {
        if (!standard || dps > standard.dps) standard = result;
        // Best moveset per charged-move type -- lets a card show both a same-type
        // STAB pick and a different-type coverage alternative (e.g. for a raid
        // boss that resists the STAB type).
        const existing = bestByChargedType.get(charged.type);
        if (!existing || dps > existing.dps) bestByChargedType.set(charged.type, result);
      }
    }
  }

  const topByType = [...bestByChargedType.values()].sort((a, b) => b.dps - a.dps).slice(0, 2);
  return { standard: standard ?? overall, overall, topByType };
}

function scoreToTier(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) return 1;
  if (score >= 75) return 2;
  if (score >= 55) return 3;
  if (score >= 35) return 4;
  return 5;
}

function tierToScore(tier: 1 | 2 | 3 | 4 | 5): number {
  return { 1: 97, 2: 82, 3: 65, 4: 45, 5: 20 }[tier];
}

function percentileRank(value: number, sortedAsc: number[]): number {
  // fraction of the distribution this value beats, 0-1
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
}

/**
 * Most raid/research/egg catches are pre-evolutions -- the raw stats of the thing
 * you actually catch (e.g. Litwick, Lampent) are a poor proxy for whether it's worth
 * catching, since you'll almost always evolve it before raiding/battling/defending
 * with it. So every category score below is computed as "best outcome reachable by
 * evolving this species", not just the caught form's own stats.
 */
function reachableEvolutions(
  speciesId: string,
  gamemasterById: Map<string, PvPokeGamemasterPokemon>,
  memo: Map<string, string[]>,
): string[] {
  const cached = memo.get(speciesId);
  if (cached) return cached;

  const result = new Set<string>([speciesId]);
  memo.set(speciesId, [...result]); // seed to break cycles before recursing

  const gm = gamemasterById.get(speciesId);
  for (const nextId of gm?.family?.evolutions ?? []) {
    if (result.has(nextId)) continue;
    result.add(nextId);
    for (const further of reachableEvolutions(nextId, gamemasterById, memo)) {
      result.add(further);
    }
  }

  const final = [...result];
  memo.set(speciesId, final);
  return final;
}

/**
 * Mega Evolutions and Primal Reversions aren't in the permanent evolution chain
 * (PvPoke's family.evolutions only covers normal evolving), so a Pokemon with a
 * mega form was otherwise invisible to raid/defense/PvP scoring even though
 * catching it means you can mega evolve it. PvPoke links a mega/primal form to
 * its base species by sharing the same national dex number and tagging it
 * "mega" (used for Primal Reversion too), so that's what we key off of.
 */
function withMegaForms(
  ids: string[],
  gamemasterById: Map<string, PvPokeGamemasterPokemon>,
  megasByDex: Map<number, string[]>,
): string[] {
  const result = new Set(ids);
  for (const id of ids) {
    const gm = gamemasterById.get(id);
    if (!gm) continue;
    for (const megaId of megasByDex.get(gm.dex) ?? []) {
      result.add(megaId);
    }
  }
  return [...result];
}

export interface Scorer {
  scoreEntry(entry: SpawnPoolEntry): RankedSpecies;
}

/**
 * Builds the scoring engine once from the reference data (gamemaster stats, PvP
 * rankings, curated tier overrides) so it can be reused both for the bulk sync
 * pipeline (scoring the whole current spawn pool) and for one-off lookups (e.g.
 * scoring a single species a user manually logs in "My Sightings").
 */
export function createScorer(
  gamemaster: PvPokeGamemasterPokemon[],
  rankings: Record<PvpLeague, PvPokeRankingEntry[]>,
  overrides: CuratedOverride[],
  moves: Record<string, PveMoveStats> = {},
): Scorer {
  const gamemasterById = new Map(gamemaster.map((p) => [p.speciesId, p]));
  const overrideById = new Map(overrides.map((o) => [o.speciesId, o]));
  const evolutionMemo = new Map<string, string[]>();

  const megasByDex = new Map<number, string[]>();
  for (const p of gamemaster) {
    if (!p.tags?.includes("mega")) continue;
    const list = megasByDex.get(p.dex) ?? [];
    list.push(p.speciesId);
    megasByDex.set(p.dex, list);
  }

  // Precompute each species' best raid moveset(s) once, plus the resulting
  // Attack*DPS distribution (using the "standard", non-Elite-TM moveset) used to
  // percentile-rank raid attacker quality.
  const movesetById = new Map<string, MovesetOptions>();
  for (const p of gamemaster) {
    movesetById.set(p.speciesId, bestMovesets(p, moves));
  }
  const raidPowerValues = [...movesetById.entries()]
    .map(([id, m]) => (m.standard ? gamemasterById.get(id)!.baseStats.atk * m.standard.dps : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const atkValues = gamemaster.map((p) => p.baseStats.atk).sort((a, b) => a - b);
  const bulkValues = gamemaster.map((p) => p.baseStats.hp * p.baseStats.def).sort((a, b) => a - b);

  const rankIndexByLeague: Record<PvpLeague, Map<string, number>> = {
    great: new Map(rankings.great.map((e, i) => [e.speciesId, i])),
    ultra: new Map(rankings.ultra.map((e, i) => [e.speciesId, i])),
    master: new Map(rankings.master.map((e, i) => [e.speciesId, i])),
  };
  const entryByLeague: Record<PvpLeague, Map<string, PvPokeRankingEntry>> = {
    great: new Map(rankings.great.map((e) => [e.speciesId, e])),
    ultra: new Map(rankings.ultra.map((e) => [e.speciesId, e])),
    master: new Map(rankings.master.map((e) => [e.speciesId, e])),
  };

  function nameOf(id: string): string {
    return gamemasterById.get(id)?.speciesName ?? id;
  }

  function pvpForLeague(id: string, league: PvpLeague): CategoryScore | null {
    const rankEntry = entryByLeague[league].get(id);
    if (!rankEntry) return null;
    const rank = (rankIndexByLeague[league].get(id) ?? 0) + 1;
    const score = rankEntry.score ?? Math.max(0, 100 - rank / 10);
    return {
      score,
      tier: scoreToTier(score),
      reason: `#${rank} in ${league[0].toUpperCase()}${league.slice(1)} League (score ${score.toFixed(1)})`,
    };
  }

  function pvpFor(id: string): (CategoryScore & { league: PvpLeague }) | null {
    let best: (CategoryScore & { league: PvpLeague }) | null = null;
    for (const league of LEAGUES) {
      const result = pvpForLeague(id, league);
      if (result && (!best || result.score > best.score)) {
        best = { ...result, league };
      }
    }
    return best;
  }

  // Master League has no CP cap, so the ideal spread there is simply max level
  // and perfect IVs -- no lookup needed. Great/Ultra use PvPoke's own rank-#1 IV
  // spread per CP cap (already computed and shipped in gamemaster.json).
  function idealIvsFor(id: string | null, league: PvpLeague): IdealIVs | null {
    if (!id) return null;
    if (league === "master") {
      return { level: 50, atk: 15, def: 15, sta: 15 };
    }
    const gm = gamemasterById.get(id);
    const key = league === "great" ? "cp1500" : "cp2500";
    const arr = gm?.defaultIVs?.[key];
    if (!arr || arr.length < 4) return null;
    const [level, atk, def, sta] = arr;
    return { level, atk, def, sta };
  }

  // PvPoke's own editorial pick for the best fast + charged-move loadout in this
  // league (already computed by their ranking generation, not something we derive).
  function pvpMovesetFor(id: string | null, league: PvpLeague): PvpMoveset | null {
    if (!id) return null;
    const raw = entryByLeague[league].get(id)?.moveset;
    if (!raw || raw.length === 0) return null;
    const [fastMoveId, ...chargedMoveIds] = raw;
    return {
      fastMove: friendlyMoveName(fastMoveId),
      chargedMoves: chargedMoveIds.map(friendlyMoveName),
    };
  }

  function raidAttackerFor(id: string): CategoryScore | null {
    const override = overrideById.get(id);
    if (override?.raidAttackerTier) {
      return {
        score: tierToScore(override.raidAttackerTier),
        tier: override.raidAttackerTier,
        reason: override.note ?? "Known top-tier raid attacker.",
      };
    }
    const gm = gamemasterById.get(id);
    if (!gm) return null;

    const movesets = movesetById.get(id);
    const moveset = movesets?.standard;
    if (moveset && raidPowerValues.length > 0) {
      const power = gm.baseStats.atk * moveset.dps;
      const pct = percentileRank(power, raidPowerValues);
      const score = Math.round(pct * 100);

      // If a much better moveset exists but needs an Elite TM (or a legacy move),
      // mention it as a short bonus rather than scoring as if every catch has it.
      // The moveset itself is shown separately in the card's moveset row already.
      const overall = movesets?.overall;
      const eliteNote =
        overall && overall !== moveset && overall.dps > moveset.dps * 1.1
          ? ` Elite TM ${friendlyMoveName(overall.chargedMoveId)} does better.`
          : "";

      return {
        score,
        tier: scoreToTier(score),
        reason: `Top ${Math.max(1, 100 - score)}% raid DPS (Attack ${gm.baseStats.atk}, real moves + STAB).${eliteNote}`,
      };
    }

    // Fallback if PvE move stats didn't resolve for this species (e.g. sync ran
    // before moves.json was cached) -- raw Attack stat only, clearly labeled as such.
    const pct = percentileRank(gm.baseStats.atk, atkValues);
    const score = Math.round(pct * 100);
    return {
      score,
      tier: scoreToTier(score),
      reason: `Attack ${gm.baseStats.atk}, top ${Math.max(1, 100 - score)}% (no moveset data).`,
    };
  }

  function gymDefenderFor(id: string): CategoryScore | null {
    const override = overrideById.get(id);
    if (override?.gymDefenderTier) {
      return {
        score: tierToScore(override.gymDefenderTier),
        tier: override.gymDefenderTier,
        reason: override.note ?? "Known solid gym defender.",
      };
    }
    const gm = gamemasterById.get(id);
    if (!gm) return null;
    const bulk = gm.baseStats.hp * gm.baseStats.def;
    const pct = percentileRank(bulk, bulkValues);
    const score = Math.round(pct * 100);
    return { score, tier: scoreToTier(score), reason: `Bulk (HP×Def) top ${Math.max(1, 100 - score)}%.` };
  }

  // Picks the best-scoring candidate among the caught species and everything it can
  // evolve into, annotates the reason when the payoff comes from evolving, and
  // reports which candidate id actually won (so callers can look up more detail
  // about it, e.g. its moveset, beyond what the CategoryScore itself carries).
  function bestAcrossEvolutions<T extends CategoryScore>(
    caughtId: string,
    candidateIds: string[],
    scoreFn: (id: string) => T | null,
  ): { result: T | null; bestId: string | null } {
    let best: T | null = null;
    let bestId: string | null = null;
    for (const id of candidateIds) {
      const result = scoreFn(id);
      if (result && (!best || result.score > best.score)) {
        best = result;
        bestId = id;
      }
    }
    if (best && bestId && bestId !== caughtId) {
      const isPrimal = bestId.endsWith("_primal");
      const isMega = !isPrimal && gamemasterById.get(bestId)?.tags?.includes("mega");
      const verb = isPrimal ? "Primal Reverts into" : isMega ? "Mega Evolves into" : "Evolves into";
      return { result: { ...best, reason: `${verb} ${nameOf(bestId)} -- ${best.reason}` }, bestId };
    }
    return { result: best, bestId };
  }

  function scoreEntry(entry: SpawnPoolEntry): RankedSpecies {
    const speciesId = entry.speciesId;
    const baseCandidateIds = speciesId ? reachableEvolutions(speciesId, gamemasterById, evolutionMemo) : [];
    // Mega Evolutions/Primal Reversions are temporary battle states -- you can use
    // them to raid or battle, but you can never place a mega-evolved Pokemon in a
    // gym to defend (it reverts). So gym defense scoring must stick to permanent
    // evolutions only, while PvP and raid attacking can consider mega forms too.
    const candidateIds = speciesId ? withMegaForms(baseCandidateIds, gamemasterById, megasByDex) : [];

    const pvp = speciesId ? bestAcrossEvolutions(speciesId, candidateIds, pvpFor).result : null;

    const emptyPick = { result: null, bestId: null } as const;
    const pvpGreatPick = speciesId ? bestAcrossEvolutions(speciesId, candidateIds, (id) => pvpForLeague(id, "great")) : emptyPick;
    const pvpUltraPick = speciesId ? bestAcrossEvolutions(speciesId, candidateIds, (id) => pvpForLeague(id, "ultra")) : emptyPick;
    const pvpMasterPick = speciesId ? bestAcrossEvolutions(speciesId, candidateIds, (id) => pvpForLeague(id, "master")) : emptyPick;
    const pvpByLeague: Record<PvpLeague, CategoryScore | null> = {
      great: pvpGreatPick.result,
      ultra: pvpUltraPick.result,
      master: pvpMasterPick.result,
    };
    // Tied to whichever evolution actually won that league's score, same as the
    // raid-attacker moveset display below -- a pre-evolution's Great League IVs
    // should reflect its evolved form, not itself.
    const pvpIVs: Record<PvpLeague, IdealIVs | null> = {
      great: idealIvsFor(pvpGreatPick.bestId, "great"),
      ultra: idealIvsFor(pvpUltraPick.bestId, "ultra"),
      master: idealIvsFor(pvpMasterPick.bestId, "master"),
    };
    const pvpMoveset: Record<PvpLeague, PvpMoveset | null> = {
      great: pvpMovesetFor(pvpGreatPick.bestId, "great"),
      ultra: pvpMovesetFor(pvpUltraPick.bestId, "ultra"),
      master: pvpMovesetFor(pvpMasterPick.bestId, "master"),
    };
    const raidAttackerPick = speciesId
      ? bestAcrossEvolutions(speciesId, candidateIds, raidAttackerFor)
      : { result: null, bestId: null };
    const raidAttacker = raidAttackerPick.result;
    const gymDefender = speciesId ? bestAcrossEvolutions(speciesId, baseCandidateIds, gymDefenderFor).result : null;

    // Moveset display is tied to whichever form actually won the raid-attacker
    // score (e.g. a Mega form), not the caught species' own (often weaker) moves.
    const moveset: RankedSpecies["moveset"] = (
      (raidAttackerPick.bestId && movesetById.get(raidAttackerPick.bestId)?.topByType) ||
      []
    ).map((m) => ({
      fastMove: friendlyMoveName(m.fastMoveId),
      chargedMove: friendlyMoveName(m.chargedMoveId),
      type: m.chargedType,
    }));

    // --- Stardust: only a real, active bonus-stardust-on-catch mechanic counts ---
    // (Community Day's "3x Catch Stardust" bonus, or a Spotlight Hour whose rotating
    // bonus happens to be stardust) -- not a general "worth farming" guess.
    const stardust: CategoryScore | null = entry.stardustBonusDetail
      ? { score: 95, tier: 1, reason: entry.stardustBonusDetail }
      : null;

    const categoriesHit = [
      pvp && pvp.tier <= 2,
      raidAttacker && raidAttacker.tier <= 2,
      gymDefender && gymDefender.tier <= 2,
      stardust && stardust.tier <= 2,
    ].filter(Boolean).length;

    // Bottom line: of everything this species (or its evolutions) is good for, what's
    // the strongest case for spending balls/time on it right now?
    const candidates: { key: "pvp" | "raidAttacker" | "gymDefender" | "stardust"; cat: CategoryScore }[] = [
      pvp && { key: "pvp" as const, cat: pvp },
      raidAttacker && { key: "raidAttacker" as const, cat: raidAttacker },
      gymDefender && { key: "gymDefender" as const, cat: gymDefender },
      stardust && { key: "stardust" as const, cat: stardust },
    ].filter((x): x is { key: "pvp" | "raidAttacker" | "gymDefender" | "stardust"; cat: CategoryScore } => !!x);

    let bestCategory: RankedSpecies["bestCategory"] = null;
    for (const c of candidates) {
      if (!bestCategory || c.cat.score > bestCategory.score) {
        bestCategory = { key: c.key, score: c.cat.score, tier: c.cat.tier };
      }
    }

    const verdict: RankedSpecies["verdict"] =
      !bestCategory || bestCategory.tier >= 5
        ? "Skip / Dex Only"
        : bestCategory.tier === 1
          ? "Must Catch"
          : bestCategory.tier === 2
            ? "Worth Catching"
            : "Situational";

    return {
      rawName: entry.rawName,
      speciesId: entry.speciesId,
      speciesName: entry.speciesName ?? entry.rawName,
      dex: entry.dex,
      types: entry.types,
      canBeShiny: entry.canBeShiny,
      sources: entry.sources,
      pvp,
      pvpByLeague,
      pvpIVs,
      pvpMoveset,
      raidAttacker,
      gymDefender,
      stardust,
      moveset,
      stardustBonusDetail: entry.stardustBonusDetail,
      nextEventStart: entry.nextEventStart,
      categoriesHit,
      bestCategory,
      verdict,
    };
  }

  return { scoreEntry };
}

export function computeScores(
  pool: SpawnPoolEntry[],
  gamemaster: PvPokeGamemasterPokemon[],
  rankings: Record<PvpLeague, PvPokeRankingEntry[]>,
  overrides: CuratedOverride[],
  moves: Record<string, PveMoveStats> = {},
): RankedSpecies[] {
  const scorer = createScorer(gamemaster, rankings, overrides, moves);
  return pool.map((entry) => scorer.scoreEntry(entry));
}
