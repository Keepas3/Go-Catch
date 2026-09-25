import type { LeekDuckRawFeeds } from "./fetchLeekDuck.js";
import type { PvPokeGamemasterPokemon, SourceTag, SpawnPoolEntry } from "./types.js";
import { buildSpeciesMatcher } from "./normalize.js";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/**
 * Merges everything currently obtainable in Pokemon GO (per LeekDuck) into one
 * deduplicated species list with source tags. This intentionally excludes the
 * baseline non-event wild spawn pool, which LeekDuck does not track structurally
 * (see plan's scoping note) -- it covers raids, eggs, field research, and
 * currently-running event/spotlight/community-day spawns instead.
 */
export function buildSpawnPool(
  feeds: LeekDuckRawFeeds,
  gamemaster: PvPokeGamemasterPokemon[],
  now: Date = new Date(),
): SpawnPoolEntry[] {
  const resolve = buildSpeciesMatcher(gamemaster);
  const bySpecies = new Map<string, SpawnPoolEntry>();

  function add(
    rawName: string,
    canBeShiny: boolean,
    source: SourceTag,
    stardustBonusDetail: string | null = null,
    eventStart: string | null = null,
  ) {
    const match = resolve(rawName);
    const key = match ? match.speciesId : `unresolved:${rawName.toLowerCase()}`;

    const existing = bySpecies.get(key);
    if (existing) {
      existing.canBeShiny = existing.canBeShiny || canBeShiny;
      existing.stardustBonusDetail = existing.stardustBonusDetail ?? stardustBonusDetail;
      if (eventStart && (!existing.nextEventStart || eventStart < existing.nextEventStart)) {
        existing.nextEventStart = eventStart;
      }
      if (!existing.sources.some((s) => s.type === source.type && s.detail === source.detail)) {
        existing.sources.push(source);
      }
      return;
    }

    bySpecies.set(key, {
      rawName,
      speciesId: match?.speciesId ?? null,
      speciesName: match?.speciesName ?? rawName,
      dex: match?.dex ?? null,
      types: match?.types ?? [],
      canBeShiny,
      sources: [source],
      stardustBonusDetail,
      nextEventStart: eventStart,
    });
  }

  for (const boss of feeds.raids) {
    add(boss.name, boss.canBeShiny, { type: "raid", detail: boss.tier });
  }

  for (const egg of feeds.eggs) {
    if (egg.isGiftExchange) continue; // not something you catch in the wild/raids
    add(egg.name, egg.canBeShiny, { type: "egg", detail: egg.eggType });
  }

  for (const task of feeds.research) {
    const detail = stripHtml(task.text);
    for (const reward of task.rewards) {
      add(reward.name, reward.canBeShiny, { type: "research", detail });
    }
  }

  for (const event of feeds.events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const isLive = start <= now && now <= end;
    const isUpcomingSoon = start > now && start.getTime() - now.getTime() < 1000 * 60 * 60 * 24 * 30;
    if (!isLive && !isUpcomingSoon) continue;

    const extra = event.extraData as Record<string, any>;
    const when = isLive ? "live now" : `starts ${start.toLocaleDateString()}`;

    const communityDay = extra?.communityday;
    if (communityDay?.spawns) {
      // Match "Catch Stardust" specifically -- CD bonus lists also include unrelated
      // stardust mentions like "Trades made will require 50% less Stardust".
      const stardustBonus = (communityDay.bonuses as { text: string }[] | undefined)?.find((b) =>
        /catch\s+stardust/i.test(b.text),
      );
      const stardustBonusDetail = stardustBonus
        ? `Community Day bonus: ${stardustBonus.text} (${event.name}, ${when})`
        : null;
      for (const spawn of communityDay.spawns as { name: string }[]) {
        add(
          spawn.name,
          true,
          { type: "spawn", detail: `Community Day: ${event.name} (${when})` },
          stardustBonusDetail,
          event.start,
        );
      }
    }

    const spotlight = extra?.spotlight;
    if (spotlight?.name) {
      const stardustBonusDetail =
        typeof spotlight.bonus === "string" && /catch\s+stardust/i.test(spotlight.bonus)
          ? `Spotlight Hour bonus: ${spotlight.bonus} (${when})`
          : null;
      add(
        spotlight.name,
        !!spotlight.canBeShiny,
        { type: "spotlight", detail: `Spotlight Hour: ${spotlight.bonus ?? event.name} (${when})` },
        stardustBonusDetail,
        event.start,
      );
    }
  }

  return [...bySpecies.values()];
}
