#!/usr/bin/env node
/**
 * Checks if vehicle-positions.json is being updated.
 * Monitors mtime for ~30s and reports update count.
 * Run: node backend/scripts/check-vehicle-positions-update.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "data", "vehicle-positions.json");

const INTERVAL_MS = 2000;  // check every 2s
const DURATION_MS = 30000; // run for 30s

function getMtime() {
  try {
    const s = fs.statSync(FILE);
    return s.mtimeMs;
  } catch (e) {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.log("File does not exist:", FILE);
    process.exit(1);
  }

  let lastMtime = getMtime();
  let updateCount = 0;
  const start = Date.now();

  console.log(`Monitoring ${FILE} for ${DURATION_MS / 1000}s (check every ${INTERVAL_MS / 1000}s)...`);
  console.log("Initial mtime:", lastMtime ? new Date(lastMtime).toISOString() : "N/A");

  while (Date.now() - start < DURATION_MS) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    const m = getMtime();
    if (m !== null && m !== lastMtime) {
      updateCount++;
      const when = new Date(m).toISOString();
      console.log(`  Update #${updateCount} at ${when}`);
      lastMtime = m;
    }
  }

  console.log(`\nResult: ${updateCount} update(s) detected in ${DURATION_MS / 1000}s`);
  if (updateCount === 0) {
    console.log("→ File is NOT being updated. Is simulate-emergency-vehicles.js running?");
  } else {
    console.log("→ File IS being updated.");
  }
}

main().catch(console.error);
