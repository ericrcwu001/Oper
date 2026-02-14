/**
 * Reads SF crimes CSV and returns crimes for a given date as a time-ordered list.
 * Each crime has simSecondsFromMidnight (seconds from 00:00:00 that day) for 3x playback.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', '..', 'SF-crimes-2013-2015.csv');

/** Parse one CSV line respecting quoted fields (e.g. "ARREST, BOOKED"). */
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

/** Parse "2015-05-13 23:53:00" to { date, secondsFromMidnight }. */
function parseDateAndSeconds(rowDates) {
  const [datePart, timePart] = String(rowDates).trim().split(/\s+/);
  if (!datePart || !timePart) return null;
  const [h, m, s] = timePart.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  const secondsFromMidnight = h * 3600 + m * 60 + (s || 0);
  return { date: datePart, secondsFromMidnight };
}

let cachedRows = null;

/** Load and cache all CSV rows (header + data rows with parsed columns). */
async function loadCsvRows() {
  if (cachedRows) return cachedRows;
  const content = await fs.readFile(CSV_PATH, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    cachedRows = [];
    return cachedRows;
  }
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 9) continue;
    const dates = cols[0];
    const x = parseFloat(cols[cols.length - 2]);
    const y = parseFloat(cols[cols.length - 1]);
    const address = cols.length > 9 ? cols.slice(6, cols.length - 2).join(', ') : cols[6];
    const category = cols[1];
    const descript = cols[2];
    const parsed = parseDateAndSeconds(dates);
    if (!parsed || Number.isNaN(x) || Number.isNaN(y)) continue;
    rows.push({
      date: parsed.date,
      secondsFromMidnight: parsed.secondsFromMidnight,
      category,
      descript,
      address,
      lng: x,
      lat: y,
    });
  }
  cachedRows = rows;
  return cachedRows;
}

/**
 * Get crimes for a single day, sorted by time.
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Array<{ id: string, lat: number, lng: number, simSecondsFromMidnight: number, category?: string, address?: string }>>}
 */
export async function getCrimesForDay(date) {
  const rows = await loadCsvRows();
  const normalized = String(date).trim().slice(0, 10);
  const dayRows = rows.filter((r) => r.date === normalized);
  dayRows.sort((a, b) => a.secondsFromMidnight - b.secondsFromMidnight);

  return dayRows.map((r, i) => ({
    id: `crime-${normalized}-${i}-${r.secondsFromMidnight}`,
    lat: r.lat,
    lng: r.lng,
    simSecondsFromMidnight: r.secondsFromMidnight,
    category: r.category,
    address: r.address,
    description: r.descript,
  }));
}

/**
 * Get a random date that exists in the CSV (for default "today" simulation).
 */
export async function getRandomDateInDataset() {
  const rows = await loadCsvRows();
  if (rows.length === 0) return null;
  const dates = [...new Set(rows.map((r) => r.date))];
  return dates[Math.floor(Math.random() * dates.length)];
}
