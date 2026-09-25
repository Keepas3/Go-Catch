import type { NextFunction, Request, Response } from "express";

// Single-user personal deployment: rather than a full account system, a
// shared secret set via env var gates the API. Left unset, the app behaves
// exactly as it did before -- fine for localhost-only use, but anyone
// exposing this beyond their own machine should set AUTH_TOKEN.
//
// Requiring the token in an `Authorization` header (instead of a cookie) is
// also what closes the CSRF gap: unlike a cookie, the browser never attaches
// this header to a request on its own, so a malicious page on another origin
// can't ride the user's session to trigger a write here.
const AUTH_TOKEN = process.env.AUTH_TOKEN?.trim() || null;

if (!AUTH_TOKEN) {
  console.warn(
    "[auth] AUTH_TOKEN is not set -- /api routes are unauthenticated. Set the AUTH_TOKEN " +
      "environment variable before exposing this server beyond localhost.",
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) {
    next();
    return;
  }

  const header = req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided && timingSafeEqual(provided, AUTH_TOKEN)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
