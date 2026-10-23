# GO Best Catches Currently

**[Live site](https://keepas3.github.io/Go-Catch/)**

A dashboard that tells Pokémon GO players which currently available Pokémon are actually worth catching. It pulls live raid, egg, research and event data, scores each Pokémon for raids, gym defense and PvP, and refreshes itself every day with no server.

## What it does

- **Ranks every available Pokémon** by what it's good for: raid attacking, gym defense, PvP (Great, Ultra and Master League), and bonus-stardust events.
- **Looks ahead at evolutions.** A weak-looking Pokémon can be a strong catch if it evolves into a top attacker, so the scoring checks what each one can become.
- **Shows what's live right now:** current raid bosses, upcoming and live events, and Community Day spawns, all in one dashboard.
- **Includes a personal sightings log.** Type in a Pokémon you just saw and get an instant "worth catching?" verdict, saved privately in your own browser.

## Highlights

- **Fully automated.** A scheduled GitHub Actions workflow re-fetches the data, re-scores everything and redeploys the site daily.
- **Free to run.** The site is static and hosted on GitHub Pages, with no backend, database or paid services.
- **Built on real game data.** Move stats, PvP rankings and event schedules come from community-maintained sources rather than hand-typed lists.
- **Safe by design.** All third-party text is escaped before it reaches the page, and external links are limited to http(s).

## Built with

JavaScript, TypeScript, Node.js, HTML/CSS, GitHub Actions, GitHub Pages

## Run it locally

```bash
npm install
npm run dev     # fetch fresh data, then serve at http://localhost:3000
```

## Data credits

Event, raid and research data from [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) (sourced from [LeekDuck](https://leekduck.com)), PvP rankings from [PvPoke](https://github.com/pvpoke/pvpoke), and move stats from [PokeMiners](https://github.com/PokeMiners/game_masters). Per ScrapedDuck's terms, this project stays free and ad-free.

*Scores are a simplified model meant as a quick guide, not an exact battle simulator. The tracker covers event-featured Pokémon, not every wild spawn.*
