import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeekDuckEgg, LeekDuckEvent, LeekDuckRaidBoss, LeekDuckResearchTask } from "./types.js";

// ScrapedDuck routinely scrapes LeekDuck.com and publishes the result on its
// `data` branch as static JSON. Free, no auth, updated roughly daily.
// Credit: https://github.com/bigfoott/ScrapedDuck and https://leekduck.com
const BASE = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data";

async function fetchJson<T>(relativePath: string): Promise<T> {
  const res = await fetch(`${BASE}/${relativePath}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${relativePath}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface LeekDuckRawFeeds {
  raids: LeekDuckRaidBoss[];
  eggs: LeekDuckEgg[];
  research: LeekDuckResearchTask[];
  events: LeekDuckEvent[];
}

export async function fetchLeekDuckFeeds(cacheDir: string): Promise<LeekDuckRawFeeds> {
  const [raids, eggs, research, events] = await Promise.all([
    fetchJson<LeekDuckRaidBoss[]>("raids.json"),
    fetchJson<LeekDuckEgg[]>("eggs.json"),
    fetchJson<LeekDuckResearchTask[]>("research.json"),
    fetchJson<LeekDuckEvent[]>("events.json"),
  ]);

  await Promise.all([
    writeFile(path.join(cacheDir, "raw-raids.json"), JSON.stringify(raids, null, 2)),
    writeFile(path.join(cacheDir, "raw-eggs.json"), JSON.stringify(eggs, null, 2)),
    writeFile(path.join(cacheDir, "raw-research.json"), JSON.stringify(research, null, 2)),
    writeFile(path.join(cacheDir, "raw-events.json"), JSON.stringify(events, null, 2)),
  ]);

  return { raids, eggs, research, events };
}
