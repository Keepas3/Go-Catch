import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local-dev only: production is a static site (see .github/workflows/deploy.yml).
// Mirrors that layout -- web/ at the root, cache/ exposed at /data -- so the
// browser code uses the same relative URLs in both places.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use("/data", express.static(path.join(root, "cache")));
app.use(express.static(path.join(root, "web")));

app.listen(port, () => {
  console.log(`Pokemon GO catch-list dashboard running at http://localhost:${port}`);
});
