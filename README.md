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

## Usage

```bash
npm install
npm run sync   # fetches fresh data and writes cache/scoreboard.json
npm run serve  # serves the dashboard at http://localhost:3000
```

Or `npm run dev` to do both. Re-run `npm run sync` periodically to keep the
scoreboard current — source data updates roughly daily. The dashboard server
just serves whatever `cache/scoreboard.json` currently contains, so re-running
sync doesn't require restarting the server.

## Automatic sync (Windows Task Scheduler)

A weekly sync is already set up on this machine:

- **Task name:** `PogoCatchListSync` (Windows Task Scheduler)
- **Runs:** every Sunday at 6:00 AM
- **What it runs:** [`sync.bat`](sync.bat), which `cd`s into this folder and runs
  `npm run sync`, appending output to `sync.log` (gitignored, local only)

Manage it with:

```powershell
schtasks /query /tn "PogoCatchListSync" /v /fo LIST   # check status / next run time
schtasks /run /tn "PogoCatchListSync"                  # trigger a run right now
schtasks /change /tn "PogoCatchListSync" /st 06:00     # change the time
schtasks /delete /tn "PogoCatchListSync" /f            # remove it
```

Note: this only fires if the machine is on and awake at the scheduled time —
Task Scheduler doesn't run missed tasks retroactively by default. Check
`sync.log` if the dashboard looks stale.
