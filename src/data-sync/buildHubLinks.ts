import type { PvPokeGamemasterPokemon } from "./types.js";

// Pokemon GO Hub keys most pages by dex number (/pokemon/6), but forms use their
// own slugs (/pokemon/487-Origin, /pokemon/26-Alola), and some base numbers
// have no page at all. Rather than hand-maintain exceptions, we read the site's
// own sitemap and resolve each species to a slug that really exists.
const HUB = "https://db.pokemongohub.net";

const TOKEN_ALIASES: Record<string, string> = { Alolan: "Alola" };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (go-catch sync)" } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

export async function fetchHubSlugs(): Promise<Set<string>> {
  const index = await fetchText(`${HUB}/sitemap.xml`);
  const sitemapUrls = [...index.matchAll(/<loc>([^<]*\/pokemon\/sitemap\/\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  if (sitemapUrls.length === 0) throw new Error("no pokemon sitemaps found");

  const slugs = new Set<string>();
  const pages = await Promise.all(sitemapUrls.map(fetchText));
  for (const xml of pages) {
    for (const m of xml.matchAll(/<loc>[^<]*\/pokemon\/([^/<]+)<\/loc>/g)) slugs.add(m[1]);
  }
  return slugs;
}

function formTokens(speciesName: string): string[] {
  return [...speciesName.matchAll(/\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((t) => t && t !== "Shadow") // shadow forms share the regular page
    .map((t) => TOKEN_ALIASES[t] ?? t.replace(/\s+/g, "_"));
}

/**
 * Best existing hub slug for a species: the full form ("487-Origin"), then each
 * single form word, then the plain dex number. Null when the site has no page.
 */
export function resolveHubSlug(speciesName: string, dex: number | null, slugs: Set<string>): string | null {
  if (!dex) return null;
  const tokens = formTokens(speciesName);
  const candidates = [
    ...(tokens.length ? [`${dex}-${tokens.join("_")}`] : []),
    ...tokens.map((t) => `${dex}-${t}`),
    String(dex),
  ];
  const exact = candidates.find((c) => slugs.has(c));
  if (exact) return exact;

  // Species the site only lists as separate forms (e.g. Deoxys): land on the
  // first ordinary form page rather than a dead link.
  const prefix = `${dex}-`;
  for (const slug of slugs) {
    if (slug.startsWith(prefix) && !/(Shadow|Mega|Primal|Dynamax|Gigantamax)/.test(slug)) return slug;
  }
  return null;
}

/**
 * Only species whose page isn't the plain dex number are listed (null = the
 * site has no page for it), keeping the file small; the browser falls back to
 * /pokemon/<dex> for everything else.
 */
export function buildHubLinks(
  gamemaster: PvPokeGamemasterPokemon[],
  slugs: Set<string>,
): Record<string, string | null> {
  const links: Record<string, string | null> = {};
  for (const p of gamemaster) {
    if (p.released === false || !p.dex) continue;
    const slug = resolveHubSlug(p.speciesName, p.dex, slugs);
    if (slug !== String(p.dex)) links[p.speciesId] = slug;
  }
  return links;
}
