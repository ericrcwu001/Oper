#!/usr/bin/env node
/**
 * Reset all vehicle positions to diversified nodes from sf-roads-graph.json.
 * Overwrites lat/lng in vehicle-positions.json; removes targetLat/targetLng; sets status to 0.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PATH = path.join(__dirname, "..", "data", "sf-roads-graph.json");
const VEHICLE_PATH = path.join(__dirname, "..", "data", "vehicle-positions.json");

// SF approximate bounds (from graph nodes)
const SF_LAT_MIN = 37.7;
const SF_LAT_MAX = 37.84;
const SF_LNG_MIN = -122.52;
const SF_LNG_MAX = -122.35;

function partitionNodes(nodes, gridRows, gridCols) {
  const cells = Array.from({ length: gridRows * gridCols }, () => []);
  for (let i = 0; i < nodes.length; i++) {
    const [lat, lng] = nodes[i];
    if (lat < SF_LAT_MIN || lat > SF_LAT_MAX || lng < SF_LNG_MIN || lng > SF_LNG_MAX) continue;
    const row = Math.min(
      gridRows - 1,
      Math.floor(((lat - SF_LAT_MIN) / (SF_LAT_MAX - SF_LAT_MIN)) * gridRows)
    );
    const col = Math.min(
      gridCols - 1,
      Math.floor(((lng - SF_LNG_MIN) / (SF_LNG_MAX - SF_LNG_MIN)) * gridCols)
    );
    cells[row * gridCols + col].push(i);
  }
  return cells;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickDiversifiedNodes(nodes, count) {
  const gridRows = 8;
  const gridCols = 10;
  const cells = partitionNodes(nodes, gridRows, gridCols);
  const cellOrder = shuffle(cells.map((_, i) => i));
  const selected = [];
  const usedNodeIdx = new Set();

  for (let round = 0; selected.length < count && round < 3; round++) {
    for (const idx of cellOrder) {
      if (selected.length >= count) break;
      const cell = cells[idx];
      if (cell.length === 0) continue;
      const candidates = cell.filter((i) => !usedNodeIdx.has(i));
      if (candidates.length === 0) continue;
      const nodeIdx = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push(nodeIdx);
      usedNodeIdx.add(nodeIdx);
    }
  }

  if (selected.length < count) {
    for (let i = 0; i < nodes.length && selected.length < count; i++) {
      if (!usedNodeIdx.has(i)) {
        selected.push(i);
        usedNodeIdx.add(i);
      }
    }
  }
  return selected;
}

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
const vehicles = JSON.parse(fs.readFileSync(VEHICLE_PATH, "utf8"));

const nodes = graph.nodes;
const indices = pickDiversifiedNodes(nodes, vehicles.length);

for (let i = 0; i < vehicles.length; i++) {
  const v = vehicles[i];
  const [lat, lng] = nodes[indices[i]];
  v.lat = lat;
  v.lng = lng;
  delete v.targetLat;
  delete v.targetLng;
  v.status = 0;
}

fs.writeFileSync(VEHICLE_PATH, JSON.stringify(vehicles, null, 0));
console.log(`Reset ${vehicles.length} vehicles to diversified road graph nodes.`);
