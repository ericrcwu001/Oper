#!/usr/bin/env node
/**
 * Verify A* routing and graph connectivity.
 * Run: node backend/scripts/verify-astar-routing.js
 * Or:  npm run verify-astar (if added to package.json)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { haversineMeters } from "../src/utils/geo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PATH = path.join(__dirname, "..", "data", "sf-roads-graph.json");

function loadGraph() {
  if (!fs.existsSync(GRAPH_PATH)) {
    console.error("Missing", GRAPH_PATH, "- run: npm run build-roads-graph");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
}

function nearestNode(g, lat, lng) {
  const target = [lat, lng];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = haversineMeters(g.nodes[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Compute connected component for each node. */
function computeComponents(g) {
  const { nodes, edges, adjacency } = g;
  const compId = new Array(nodes.length).fill(-1);
  let compCount = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (compId[i] >= 0) continue;
    compId[i] = compCount;
    const q = [i];
    while (q.length > 0) {
      const n = q.shift();
      for (const ei of adjacency[n] || []) {
        const e = edges[ei];
        const next = e.fromNodeIdx === n ? e.toNodeIdx : e.fromNodeIdx;
        if (compId[next] < 0) {
          compId[next] = compCount;
          q.push(next);
        }
      }
    }
    compCount++;
  }
  return compId;
}

/** A* - same logic as roadRoutingService. */
function astar(g, startNodeIdx, goalNodeIdx) {
  const { nodes, edges, adjacency } = g;
  const goalPos = nodes[goalNodeIdx];
  if (!goalPos) return null;

  const open = [{ nodeIdx: startNodeIdx, g: 0, f: 0, edgeIndices: [] }];
  const closed = new Set();
  const gScore = new Map();
  gScore.set(startNodeIdx, 0);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (current.nodeIdx === goalNodeIdx) {
      return { edgeIndices: current.edgeIndices, distanceM: current.g };
    }
    if (closed.has(current.nodeIdx)) continue;
    closed.add(current.nodeIdx);

    for (const edgeIdx of adjacency[current.nodeIdx] || []) {
      const edge = edges[edgeIdx];
      const nextNodeIdx = edge.fromNodeIdx === current.nodeIdx ? edge.toNodeIdx : edge.fromNodeIdx;
      if (closed.has(nextNodeIdx)) continue;

      const tentativeG = current.g + edge.lengthM;
      const prev = gScore.get(nextNodeIdx);
      if (prev != null && tentativeG >= prev) continue;
      gScore.set(nextNodeIdx, tentativeG);

      const h = haversineMeters(nodes[nextNodeIdx], goalPos);
      const f = tentativeG + h;
      const nextEdgeIndices = [...current.edgeIndices, edgeIdx];
      open.push({ nodeIdx: nextNodeIdx, g: tentativeG, f, edgeIndices: nextEdgeIndices });
    }
  }
  return null;
}

function main() {
  const g = loadGraph();
  const { nodes, edges } = g;
  const compId = computeComponents(g);
  const numComponents = Math.max(...compId) + 1;

  console.log("=== A* & Graph Verification ===\n");
  console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges, ${numComponents} components\n`);

  // 1. Same-component pairs: A* must succeed
  let sameCompTests = 0;
  let sameCompPass = 0;
  for (let t = 0; t < 50; t++) {
    const a = Math.floor(Math.random() * nodes.length);
    const b = Math.floor(Math.random() * nodes.length);
    if (a === b) continue;
    if (compId[a] !== compId[b]) continue;
    sameCompTests++;
    const result = astar(g, a, b);
    if (result) sameCompPass++;
  }
  console.log(`1. Same-component pairs (A* should always succeed): ${sameCompPass}/${sameCompTests} passed`);

  // 2. Random real-world-style pairs (incident + vehicle)
  // SF bounds: lat 37.7-37.83, lng -122.52 to -122.35
  const samplePairs = [
    { from: { lat: 37.7749, lng: -122.4194 }, to: { lat: 37.78, lng: -122.41 }, name: "downtown" },
    { from: { lat: 37.7847, lng: -122.4094 }, to: { lat: 37.77, lng: -122.42 }, name: "north beach" },
    { from: { lat: 37.75, lng: -122.42 }, to: { lat: 37.76, lng: -122.4 }, name: "mission" },
    { from: { lat: 37.795, lng: -122.4 }, to: { lat: 37.77, lng: -122.43 }, name: "telegraph" },
    { from: { lat: 37.719, lng: -122.398 }, to: { lat: 37.74, lng: -122.38 }, name: "south" },
  ];

  let astarSuccess = 0;
  for (const p of samplePairs) {
    const fromNode = nearestNode(g, p.from.lat, p.from.lng);
    const toNode = nearestNode(g, p.to.lat, p.to.lng);
    const sameComp = compId[fromNode] === compId[toNode];
    const result = astar(g, fromNode, toNode);
    const ok = !!result;
    if (ok) astarSuccess++;
    console.log(`   ${p.name}: sameComp=${sameComp} A*=${ok ? "OK" : "FAIL"}`);
  }
  console.log(`\n2. Sample routing pairs: A* succeeded ${astarSuccess}/${samplePairs.length} times`);

  // 3. Bulk random pairs
  let total = 0;
  let astarOk = 0;
  for (let i = 0; i < 100; i++) {
    const from = { lat: 37.7 + Math.random() * 0.13, lng: -122.52 + Math.random() * 0.17 };
    const to = { lat: 37.7 + Math.random() * 0.13, lng: -122.52 + Math.random() * 0.17 };
    const fromNode = nearestNode(g, from.lat, from.lng);
    const toNode = nearestNode(g, to.lat, to.lng);
    if (fromNode === toNode) continue;
    total++;
    if (astar(g, fromNode, toNode)) astarOk++;
  }
  console.log(`\n3. Random 100 pairs: A* succeeded ${astarOk}/${total} (${((astarOk / total) * 100).toFixed(1)}%)`);

  if (sameCompPass < sameCompTests) {
    console.error("\n*** BUG: A* failed on same-component pairs. Algorithm may be broken. ***");
    process.exit(1);
  }
  if (astarOk / total < 0.5) {
    console.warn("\n*** Low A* success rate - graph may still be too fragmented. Consider larger SNAP_RADIUS. ***");
  } else {
    console.log("\n*** A* is working correctly. Graph connectivity is acceptable. ***");
  }
}

main();
