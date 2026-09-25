import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export interface Sighting {
  id: string;
  speciesName: string;
  note: string | null;
  canBeShiny: boolean;
  loggedAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");
const filePath = path.join(dataDir, "sightings.json");

async function readAll(): Promise<Sighting[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Sighting[];
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(sightings: Sighting[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, JSON.stringify(sightings, null, 2));
}

export async function listSightings(): Promise<Sighting[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
}

export async function addSighting(input: { speciesName: string; note?: string | null; canBeShiny?: boolean }): Promise<Sighting> {
  const speciesName = input.speciesName.trim();
  if (!speciesName) throw new Error("speciesName is required");

  const sighting: Sighting = {
    id: randomUUID(),
    speciesName,
    note: input.note?.trim() || null,
    canBeShiny: !!input.canBeShiny,
    loggedAt: new Date().toISOString(),
  };

  const all = await readAll();
  all.push(sighting);
  await writeAll(all);
  return sighting;
}

export async function deleteSighting(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}
