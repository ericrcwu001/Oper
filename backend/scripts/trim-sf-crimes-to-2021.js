#!/usr/bin/env node
/**
 * Trims SF-crimes.csv to only include data from 2013–2015.
 * Reads from backend/SF-crimes.csv, writes to backend/SF-crimes-2013-2015.csv
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, "..", "SF-crimes.csv");
const outputPath = path.join(__dirname, "..", "SF-crimes-2013-2015.csv");
const MIN_DATE = "2013-01-01";
const MAX_DATE = "2015-12-31";

const rl = createInterface({
  input: createReadStream(inputPath),
  crlfDelay: Infinity,
});

const out = createWriteStream(outputPath);
let isHeader = true;
let kept = 0;
let skipped = 0;

rl.on("line", (line) => {
  if (isHeader) {
    out.write(line + "\n");
    isHeader = false;
    return;
  }
  // First column is Dates (YYYY-MM-DD HH:MM:SS); may be quoted in CSV
  let date = line.slice(0, 10);
  if (date.startsWith('"')) date = line.slice(1, 11);
  if (date >= MIN_DATE && date <= MAX_DATE) {
    out.write(line + "\n");
    kept++;
  } else {
    skipped++;
  }
});

rl.on("close", () => {
  out.end();
  console.log("Done. Kept " + kept + " rows (2013–2015), skipped " + skipped + " rows.");
  console.log("Output: " + outputPath);
});
