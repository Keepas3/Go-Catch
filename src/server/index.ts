import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addSighting, deleteSighting, listSightings } from "./sightingsStore.js";
import { scoreSighting } from "./sightingScorer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());
app.use(express.static(path.join(root, "web")));

app.get("/api/scoreboard.json", (_req, res) => {
  res.sendFile(path.join(root, "cache", "scoreboard.json"), (err) => {
    if (err) {
      res.status(503).json({ error: "Scoreboard not generated yet." });
    }
  });
});

app.get("/api/sightings", async (_req, res) => {
  const sightings = await listSightings();
  try {
    const enriched = await Promise.all(
      sightings.map(async (s) => ({ ...s, worth: await scoreSighting(s.speciesName, s.canBeShiny) })),
    );
    res.json(enriched);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Reference data (gamemaster/rankings) hasn't been synced yet -- still show
      // the raw sightings, just without a worth calculation.
      res.json(sightings.map((s) => ({ ...s, worth: null })));
      return;
    }
    throw err;
  }
});

app.post("/api/sightings", async (req, res) => {
  const { speciesName, note, canBeShiny } = req.body ?? {};
  if (typeof speciesName !== "string" || !speciesName.trim()) {
    res.status(400).json({ error: "speciesName is required" });
    return;
  }
  const sighting = await addSighting({ speciesName, note, canBeShiny });
  res.status(201).json(sighting);
});

app.delete("/api/sightings/:id", async (req, res) => {
  const removed = await deleteSighting(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "Sighting not found" });
    return;
  }
  res.status(204).end();
});

app.listen(port, () => {
  console.log(`Pokemon GO catch-list dashboard running at http://localhost:${port}`);
});
