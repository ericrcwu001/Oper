#!/usr/bin/env node
/**
 * Build or update crime-priority-map.json from SF-crimes CSV.
 *
 * - Reads backend/SF-crimes-2013-2015.csv and collects unique Category and Descript values.
 * - Loads existing backend/data/crime-priority-map.json if present.
 * - Ensures every Category in the CSV has an entry in categoryDefaults (new ones get default 2).
 * - Leaves descriptOverrides and transcriptLabelToPriority unchanged (hand-curated).
 *
 * Usage: node backend/scripts/build-crime-priority-map.js
 * Or from backend: node scripts/build-crime-priority-map.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'SF-crimes-2013-2015.csv');
const OUT_PATH = path.join(__dirname, '..', 'data', 'crime-priority-map.json');

/** Default priority for categories not in the curated list (medium-low). */
const DEFAULT_CATEGORY_PRIORITY = 2;

function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let field = '';
      while (i < line.length && line[i] !== '"') {
        field += line[i];
        i += 1;
      }
      if (line[i] === '"') i += 1;
      out.push(field);
      if (line[i] === ',') i += 1;
      continue;
    }
    let field = '';
    while (i < line.length && line[i] !== ',') {
      field += line[i];
      i += 1;
    }
    out.push(field.trim());
    if (line[i] === ',') i += 1;
  }
  return out;
}

function normalize(s) {
  return (s || '').trim().replace(/\s+/g, ' ');
}

async function main() {
  const content = await fs.readFile(CSV_PATH, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const categories = new Set();
  const descripts = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length >= 3) {
      const cat = normalize(cols[1]);
      const desc = normalize((cols[2] || '').replace(/^\s*"|"\s*$/g, ''));
      if (cat && cat !== 'Category') categories.add(cat);
      if (desc) descripts.add(desc);
    }
  }

  let existing = { categoryDefaults: {}, descriptOverrides: {}, transcriptLabelToPriority: {} };
  try {
    const raw = await fs.readFile(OUT_PATH, 'utf-8');
    existing = JSON.parse(raw);
  } catch {
    // No existing file or invalid JSON; start fresh (but we'll write full structure below)
  }

  const categoryDefaults = { ...existing.categoryDefaults };
  for (const cat of categories) {
    if (categoryDefaults[cat] == null) {
      categoryDefaults[cat] = DEFAULT_CATEGORY_PRIORITY;
    }
  }

  const result = {
    categoryDefaults,
    descriptOverrides: existing.descriptOverrides || {},
    transcriptLabelToPriority: existing.transcriptLabelToPriority || {},
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  categoryDefaults: ${Object.keys(result.categoryDefaults).length} entries`);
  console.log(`  descriptOverrides: ${Object.keys(result.descriptOverrides).length} entries`);
  console.log(`  transcriptLabelToPriority: ${Object.keys(result.transcriptLabelToPriority).length} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
