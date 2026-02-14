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

function nodeKey(lat, lng) {
  return [Math.round(lat * NODE_KEY_PRECISION) / NODE_KEY_PRECISION, Math.round(lng * NODE_KEY_PRECISION) / NODE_KEY_PRECISION].join(",");
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

  const graph = { nodes, edges, adjacency };
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 0), "utf8");
  console.log(`Built graph: ${nodes.length} nodes, ${edges.length} edges -> ${GRAPH_PATH}`);
}

main();
