# GO Best Catches Currently

Ranks currently-obtainable Pokemon GO species (raids, eggs, field research, and
running event/spotlight/community-day spawns) by what they're worth catching
for: raid attacking, gym defense, PvP, or stardust/XL candy farming.

**Scope note:** there's no clean public feed for the full baseline wild-spawn
pool everywhere. This tracks *event-featured* obtainability (what LeekDuck
publishes structurally) rather than block-by-block scanner data.

## Data sources

- [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) (mirrors [LeekDuck.com](https://leekduck.com)) — raids, eggs, field research, events
- [PvPoke](https://github.com/pvpoke/pvpoke) — PvP rankings and species/stat data
- [PokeMiners' Game Master mirror](https://github.com/PokeMiners/game_masters) — real PvE (raid/gym) move stats: power, energy, duration. PvPoke only carries PvP move balance numbers, which differ from PvE for the same move, so raid-attacker DPS is computed from this instead.

Per ScrapedDuck's terms: this app must stay free and ad-free, and must credit
both ScrapedDuck and LeekDuck.com (see the dashboard footer).

**Raid-attacker scoring:** for each species (and everything it can evolve or
Mega/Primal into), the sync pipeline finds its highest-DPS fast+charged
moveset using real move power/energy/duration and STAB, then ranks
`Attack × DPS` against every other released Pokemon. This only considers
moves a newly-caught Pokemon can actually have — if a much better moveset
exists but needs an Elite TM (or a legacy/research-exclusive move), that's
called out separately in the reason text rather than baked into the score.
This is still a simplified model (no dodge strategy, no per-boss type
matchups or defense stat) — a solid relative ranking, not a precise raid
DPS calculator.

A small hand-curated tier list (`src/data-sync/curatedOverrides.json`) covers
a few well-known legendaries/metas where the automatic stat-based scoring
undersells them; gym-defender scoring is plain HP×Defense bulk (moves aren't
generally the deciding factor for defenders).

## Usage (local)

```bash
npm install
npm run sync        # fetches fresh data into cache/ (scoreboard.json, sighting-scores.json)
npm run serve       # serves the dashboard at http://localhost:3000
npm run build:site  # assembles the deployable static site into dist-site/
```

`npm run dev` runs sync then serve. The local server is dev-only: it serves
`web/` and exposes `cache/` at `/data`, the same layout as the deployed site.

## Hosting and automatic refresh (GitHub Actions + GitHub Pages)

The site is fully static. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
runs `npm run sync` and `npm run build:site`, then publishes `dist-site/` to
GitHub Pages:

- **When:** daily on a schedule, on every push to `main`, and on demand from the
  repo's **Actions** tab (**Run workflow**).
- **One-time setup:** repo **Settings -> Pages -> Source: GitHub Actions**.
- **If a sync fails** (an upstream feed is down), the deploy is skipped and the
  last good site stays live.
- GitHub pauses scheduled workflows in public repos after 60 days with no repo
  activity. Any push resets that; if it's ever paused, re-enable it from the
  Actions tab.

**My Sightings** is stored in each visitor's own browser (localStorage), so a
log is private to that browser and doesn't sync across devices. Worth scores for
logged species are pre-computed at sync time (`data/sighting-scores.json`).
