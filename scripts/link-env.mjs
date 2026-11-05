/**
 * Make the root .env.local visible to the Next app.
 *
 * Next only reads .env files from its own project directory, and Turbopack's
 * dev workers re-read them per process, so loading the root env inside
 * next.config.ts does not reach a route handler. A symlink does.
 *
 * It cannot be committed - it points at a file full of secrets, and .env.* is
 * ignored - so this runs on postinstall and a fresh clone heals itself.
 */

import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, ".env.local");
const link = resolve(root, "apps/web/.env.local");
const relative = "../../.env.local";

if (!existsSync(source)) {
  console.log("[zowall] no .env.local at the repo root yet - copy .env.example when you have the values");
  process.exit(0);
}

let existing = null;
try {
  existing = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "<real file>";
} catch {
  // not there
}

if (existing === relative) {
  process.exit(0);
}

if (existing === "<real file>") {
  // Someone put a real env file there. Leave it alone rather than destroying
  // values that are not in the root file.
  console.log("[zowall] apps/web/.env.local is a real file, leaving it as it is");
  process.exit(0);
}

if (existing !== null) unlinkSync(link);
symlinkSync(relative, link);
console.log("[zowall] linked apps/web/.env.local -> .env.local");
