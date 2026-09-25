import type { PvPokeGamemasterPokemon } from "./types.js";

// LeekDuck names come dressed up with costumes/captions, e.g.
// "Captain's Cap Pikachu" or "Charmander wearing Friede's goggles".
// We resolve them to a canonical PvPoke speciesId by finding the longest
// gamemaster speciesName that appears as a whole word run inside the raw name.
// Longest-match-wins so "Mega Venusaur" is preferred over "Venusaur".
export function buildSpeciesMatcher(pokemon: PvPokeGamemasterPokemon[]) {
  const sorted = [...pokemon]
    .filter((p) => p.released !== false)
    .sort((a, b) => b.speciesName.length - a.speciesName.length);

  return function resolve(rawName: string): PvPokeGamemasterPokemon | null {
    const cleaned = rawName.replace(/\s+wearing\s+.*$/i, "").trim();
    const haystack = cleaned.toLowerCase();

    for (const p of sorted) {
      const needle = p.speciesName.toLowerCase();
      if (needle.length < 3) continue;
      const idx = haystack.indexOf(needle);
      if (idx === -1) continue;
      const before = idx === 0 ? " " : haystack[idx - 1];
      const after = idx + needle.length >= haystack.length ? " " : haystack[idx + needle.length];
      if (/[a-z0-9]/i.test(before) || /[a-z0-9]/i.test(after)) continue; // not a whole-word match
      return p;
    }
    return null;
  };
}
