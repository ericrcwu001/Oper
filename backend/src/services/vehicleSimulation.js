/**
 * In-process vehicle simulation. Runs when the server starts.
 * GET /api/vehicles returns current positions from memory.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { pointAtDistanceM } from "../utils/geo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const ROADS_PATH = path.join(DATA_DIR, "sf-roads.json");
const GRAPH_PATH = path.join(DATA_DIR, "sf-roads-graph.json");

const COUNTS = { fire: 40, police: 300, ambulance: 20 };
const SPEED_BASE = { fire: 13, police: 11, ambulance: 13 };
const SPEED_VARIANCE = 0.15;
const DT_SECONDS = 0.1;
// Pause at natural stop areas (intersections): probability and duration
const PAUSE_AT_NODE_PROBABILITY = 0.4;
const PAUSE_MIN_SECONDS = 0.5;
const PAUSE_MAX_SECONDS = 2.5;
const MIN_NODE_DEGREE_FOR_PAUSE = 2; // nodes with 2+ incident edges (intersections / segment joins)

let graph = null;
let vehicles = [];
let positions = [];
let intervalId = null;

function loadGraph() {
  if (fs.existsSync(GRAPH_PATH)) {
    return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
  }
  if (fs.existsSync(ROADS_PATH)) {
    const proc = spawnSync("node", ["scripts/build-roads-graph.js"], {
      cwd: path.join(__dirname, "..", ".."),
      stdio: "inherit",
    });
    if (proc.status === 0) {
      return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
    }
  }
  return null;
}

function randomSpeed(type) {
  const base = SPEED_BASE[type];
  const r = 1 + (Math.random() * 2 - 1) * SPEED_VARIANCE;
  return base * r;
}

function spawnVehicles(g) {
  const { edges } = g;
  const list = [];
  for (const [type, count] of Object.entries(COUNTS)) {
    for (let i = 0; i < count; i++) {
      const edgeIdx = Math.floor(Math.random() * edges.length);
      const edge = edges[edgeIdx];
      const t = Math.random();
      const towardEnd = Math.random() < 0.5;
      list.push({
        id: `${type}-${i + 1}`,
        type,
        currentEdge: edgeIdx,
        t,
        towardEnd,
        targetNode: towardEnd ? edge.toNodeIdx : edge.fromNodeIdx,
        speedMetersPerSecond: randomSpeed(type),
        pauseRemainingSeconds: 0,
      });
    }
  }
  return list;
}

function pickNextEdge(g, v) {
  const { edges, adjacency } = g;
  const edge = edges[v.currentEdge];
  const atNode = v.towardEnd ? edge.toNodeIdx : edge.fromNodeIdx;
  const incident = adjacency[atNode].filter((ei) => ei !== v.currentEdge);
  if (incident.length === 0) {
    v.towardEnd = !v.towardEnd;
    v.t = v.towardEnd ? 0 : 1;
    return;
  }
  const nextEdgeIdx = incident[Math.floor(Math.random() * incident.length)];
  const nextEdge = edges[nextEdgeIdx];
  const fromNext = nextEdge.fromNodeIdx === atNode;
  v.currentEdge = nextEdgeIdx;
  v.targetNode = fromNext ? nextEdge.toNodeIdx : nextEdge.fromNodeIdx;
  v.towardEnd = fromNext;
  v.t = fromNext ? 0 : 1;
}

function maybePauseAtNode(g, v, atNodeIdx) {
  const degree = g.adjacency[atNodeIdx].length;
  if (degree < MIN_NODE_DEGREE_FOR_PAUSE || Math.random() >= PAUSE_AT_NODE_PROBABILITY) return;
  v.pauseRemainingSeconds =
    PAUSE_MIN_SECONDS + Math.random() * (PAUSE_MAX_SECONDS - PAUSE_MIN_SECONDS);
}

function advanceVehicle(g, v) {
  if (v.pauseRemainingSeconds > 0) {
    v.pauseRemainingSeconds = Math.max(0, v.pauseRemainingSeconds - DT_SECONDS);
    return;
  }

  const edge = g.edges[v.currentEdge];
  const segLen = edge.lengthM;
  const dist = v.speedMetersPerSecond * DT_SECONDS;
  const deltaT = dist / segLen;
  const dir = v.towardEnd ? 1 : -1;
  let t = v.t + dir * deltaT;

  while (t > 1 || t < 0) {
    if (t >= 1) {
      const atNode = edge.toNodeIdx;
      const carry = (t - 1) * segLen;
      pickNextEdge(g, v);
      maybePauseAtNode(g, v, atNode);
      const nextEdge = g.edges[v.currentEdge];
      if (!nextEdge || carry <= 0) {
        v.t = v.towardEnd ? 0 : 1;
        return;
      }
      v.t = v.towardEnd ? carry / nextEdge.lengthM : 1 - carry / nextEdge.lengthM;
      return;
    }
    if (t <= 0) {
      const atNode = edge.fromNodeIdx;
      const carry = -t * segLen;
      pickNextEdge(g, v);
      maybePauseAtNode(g, v, atNode);
      const nextEdge = g.edges[v.currentEdge];
      if (!nextEdge || carry <= 0) {
        v.t = v.towardEnd ? 0 : 1;
        return;
      }
      v.t = v.towardEnd ? carry / nextEdge.lengthM : 1 - carry / nextEdge.lengthM;
      return;
    }
  }
  v.t = t;
}

function positionOf(g, v) {
  const edge = g.edges[v.currentEdge];
  const dist = v.t * edge.lengthM;
  return pointAtDistanceM(edge.coords, edge.lengthM, dist);
}

function toMapPoint(v, [lat, lng]) {
  return {
    id: v.id,
    type: v.type,
    lat,
    lng,
    unitId: v.id,
    status: "en route",
  };
}

function tick() {
  for (const v of vehicles) advanceVehicle(graph, v);
  positions = vehicles.map((v) => toMapPoint(v, positionOf(graph, v)));
}

/**
 * Start the vehicle simulation. Idempotent.
 */
export function startSimulation() {
  if (intervalId) return;
  graph = loadGraph();
  if (!graph) {
    console.warn(
      "Vehicle simulation: missing sf-roads-graph.json (run: npm run fetch-sf-roads && npm run build-roads-graph). GET /api/vehicles will return []."
    );
    return;
  }
  vehicles = spawnVehicles(graph);
  tick();
  intervalId = setInterval(tick, DT_SECONDS * 1000);
  console.log(`Vehicle simulation: ${vehicles.length} vehicles running`);
}

/**
 * Get current vehicle positions (MapPoint format).
 */
export function getPositions() {
  return positions;
}
