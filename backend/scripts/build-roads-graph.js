#!/usr/bin/env node
/**
 * One-time script: build road graph from sf-roads.json.
 * Output: backend/data/sf-roads-graph.json
 *
 * Run: node backend/scripts/build-roads-graph.js
 * Or:  npm run build-roads-graph
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { haversineMeters } from "../src/utils/geo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROADS_PATH = path.join(__dirname, "..", "data", "sf-roads.json");
const GRAPH_PATH = path.join(__dirname, "..", "data", "sf-roads-graph.json");
const MAX_EDGE_M = 200;
const NODE_KEY_PRECISION = 1e5;
const MERGE_RADIUS_M = 4;
/** ~11 m at SF latitude; nodes within 4 m lie in same or adjacent cell. */
const GRID_CELL_SIZE = 0.0001;

function nodeKey(lat, lng) {
  return [Math.round(lat * NODE_KEY_PRECISION) / NODE_KEY_PRECISION, Math.round(lng * NODE_KEY_PRECISION) / NODE_KEY_PRECISION].join(",");
}

function gridCellKey(lat, lng) {
  const i = Math.floor(lat / GRID_CELL_SIZE);
  const j = Math.floor(lng / GRID_CELL_SIZE);
  return `${i},${j}`;
}

function segmentLengthM(coords) {
  let len = 0;
  for (let i = 1; i < coords.length; i++) len += haversineMeters(coords[i - 1], coords[i]);
  return len;
}

function subdivide(coords, maxM) {
  const chunks = [];
  let start = 0;
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineMeters(coords[i - 1], coords[i]);
    cum += segLen;
    if (cum >= maxM || i === coords.length - 1) {
      chunks.push(coords.slice(start, i + 1));
      start = i;
      cum = 0;
    }
  }
  if (start < coords.length - 1) chunks.push(coords.slice(start));
  return chunks;
}

function main() {
  if (!fs.existsSync(ROADS_PATH)) {
    console.error(`Missing ${ROADS_PATH}. Run: npm run fetch-sf-roads`);
    process.exit(1);
  }
  const fc = JSON.parse(fs.readFileSync(ROADS_PATH, "utf8"));
  const features = fc.features || [];

  const keyToNodeIdx = new Map();
  const nodes = [];
  const edges = [];
  const adjacency = [];

  function getOrCreateNode(lat, lng) {
    const key = nodeKey(lat, lng);
    let idx = keyToNodeIdx.get(key);
    if (idx === undefined) {
      idx = nodes.length;
      nodes.push([lat, lng]);
      keyToNodeIdx.set(key, idx);
      adjacency.push([]);
    }
    return idx;
  }

  function addEdge(fromIdx, toIdx, coords, lengthM) {
    const edgeIdx = edges.length;
    edges.push({ fromNodeIdx: fromIdx, toNodeIdx: toIdx, lengthM, coords });
    adjacency[fromIdx].push(edgeIdx);
    adjacency[toIdx].push(edgeIdx);
  }

  for (const f of features) {
    const geom = f.geometry;
    if (!geom || geom.type !== "LineString" || !geom.coordinates?.length) continue;
    const coords = geom.coordinates;
    const totalLen = segmentLengthM(coords);
    if (totalLen < 1) continue;

    const chunks = totalLen > MAX_EDGE_M ? subdivide(coords, MAX_EDGE_M) : [coords];

    for (const chunk of chunks) {
      const len = segmentLengthM(chunk);
      if (len < 1) continue;
      const a = chunk[0];
      const b = chunk[chunk.length - 1];
      const fromIdx = getOrCreateNode(a[0], a[1]);
      const toIdx = getOrCreateNode(b[0], b[1]);
      if (fromIdx !== toIdx) addEdge(fromIdx, toIdx, chunk, len);
    }
  }

  const nodeCountBefore = nodes.length;
  const edgeCountBefore = edges.length;

  // --- Merge pass: cluster nodes within MERGE_RADIUS_M, then remap ---
  if (nodes.length > 0) {
    // Union-Find over node indices
    const parent = nodes.map((_, i) => i);
    function find(i) {
      if (parent[i] !== i) parent[i] = find(parent[i]);
      return parent[i];
    }
    function union(i, j) {
      const ri = find(i);
      const rj = find(j);
      if (ri === rj) return;
      const root = Math.min(ri, rj);
      const other = Math.max(ri, rj);
      parent[other] = root;
      if (parent[root] !== root) parent[root] = find(parent[root]);
    }

    // Spatial grid: cellKey -> node indices
    const grid = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const [lat, lng] = nodes[i];
      const key = gridCellKey(lat, lng);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    const cellDirs = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (let i = 0; i < nodes.length; i++) {
      const [lat, lng] = nodes[i];
      const ci = Math.floor(lat / GRID_CELL_SIZE);
      const cj = Math.floor(lng / GRID_CELL_SIZE);
      for (const [di, dj] of cellDirs) {
        const key = `${ci + di},${cj + dj}`;
        const list = grid.get(key);
        if (!list) continue;
        for (const j of list) {
          if (j < i) continue;
          if (haversineMeters(nodes[i], nodes[j]) <= MERGE_RADIUS_M) union(i, j);
        }
      }
    }

    // Build newNodes and oldToNew: one new node per cluster (root), deterministic order
    const roots = [...new Set(nodes.map((_, i) => find(i)))].sort((a, b) => a - b);
    const rootToNewIdx = new Map();
    const newNodes = [];
    for (const r of roots) {
      rootToNewIdx.set(r, newNodes.length);
      newNodes.push(nodes[r].slice());
    }
    const oldToNew = nodes.map((_, i) => rootToNewIdx.get(find(i)));

    // Remap edges, drop self-loops, rebuild adjacency
    const newEdges = [];
    const newAdjacency = newNodes.map(() => []);
    for (const e of edges) {
      const fromNew = oldToNew[e.fromNodeIdx];
      const toNew = oldToNew[e.toNodeIdx];
      if (fromNew === toNew) continue;
      const edgeIdx = newEdges.length;
      newEdges.push({
        fromNodeIdx: fromNew,
        toNodeIdx: toNew,
        lengthM: e.lengthM,
        coords: e.coords,
      });
      newAdjacency[fromNew].push(edgeIdx);
      newAdjacency[toNew].push(edgeIdx);
    }

    // Overwrite in place for writing
    nodes.length = 0;
    nodes.push(...newNodes);
    edges.length = 0;
    edges.push(...newEdges);
    adjacency.length = 0;
    adjacency.push(...newAdjacency);
  }

  const graph = { nodes, edges, adjacency };
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 0), "utf8");
  const roadsGeoJSON = {
    type: "FeatureCollection",
    features: edges.map((e) => ({
      type: "Feature",
      properties: { highway: "unclassified" },
      geometry: { type: "LineString", coordinates: e.coords },
    })),
  };
  fs.writeFileSync(ROADS_PATH, JSON.stringify(roadsGeoJSON, null, 0), "utf8");
  console.log(
    `Merged: ${nodeCountBefore} nodes -> ${nodes.length} nodes, ${edgeCountBefore} edges -> ${edges.length} edges`
  );
  console.log(`Wrote ${GRAPH_PATH} and ${ROADS_PATH}`);
}

main();
