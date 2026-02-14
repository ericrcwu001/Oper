#!/usr/bin/env node
/**
 * Simulates ~40 fire, ~300 police, ~20 ambulance vehicles on SF road network.
 * Writes vehicle-positions.json every 1s. Format matches MapPoint (frontend).
 *
 * Run: node backend/scripts/simulate-emergency-vehicles.js
 * Or:  npm run simulate-vehicles
 *
 * Requires backend/data/sf-roads.json and backend/data/sf-roads-graph.json
 * (run fetch-sf-roads and build-roads-graph first).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { pointAtDistanceM } from "../src/utils/geo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, "..", "data");
const ROADS_PATH = path.join(DATA_DIR, "sf-roads.json");
const GRAPH_PATH = path.join(DATA_DIR, "sf-roads-graph.json");
const OUTPUT_PATH = path.join(DATA_DIR, "vehicle-positions.json");

const COUNTS = { fire: 40, police: 300, ambulance: 20 };
const SPEED_BASE = { fire: 13, police: 11, ambulance: 13 }; // m/s
const SPEED_VARIANCE = 0.15;
const DT_SECONDS = 0.1;
const WRITE_INTERVAL_MS = 1000;

function loadGraph() {
  if (fs.existsSync(GRAPH_PATH)) {
    return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
  }
  console.log("Graph not found, building from sf-roads.json...");
  if (!fs.existsSync(ROADS_PATH)) {
    console.error("Missing sf-roads.json. Run: npm run fetch-sf-roads");
    process.exit(1);
  }
  const proc = spawn("node", [path.join(__dirname, "build-roads-graph.js")], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  return new Promise((resolve, reject) => {
    proc.on("exit", (code) => {
      if (code !== 0) reject(new Error("build-roads-graph failed"));
      else resolve(JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8")));
    });
  });
}

function randomSpeed(type) {
  const base = SPEED_BASE[type];
  const r = 1 + (Math.random() * 2 - 1) * SPEED_VARIANCE;
  return base * r;
}

function spawnVehicles(graph) {
  const { nodes, edges, adjacency } = graph;
  const vehicles = [];
  let idx = 0;
  for (const [type, count] of Object.entries(COUNTS)) {
    for (let i = 0; i < count; i++) {
      const edgeIdx = Math.floor(Math.random() * edges.length);
      const edge = edges[edgeIdx];
      const t = Math.random();
      const towardEnd = Math.random() < 0.5;
      vehicles.push({
        id: `${type}-${i + 1}`,
        type,
        currentEdge: edgeIdx,
        t,
        towardEnd,
        targetNode: towardEnd ? edge.toNodeIdx : edge.fromNodeIdx,
        speedMetersPerSecond: randomSpeed(type),
      });
      idx++;
    }
  }
  return vehicles;
}

function pickNextEdge(graph, vehicle) {
  const { edges, adjacency } = graph;
  const edge = edges[vehicle.currentEdge];
  const atNode = vehicle.towardEnd ? edge.toNodeIdx : edge.fromNodeIdx;
  const incident = adjacency[atNode].filter((ei) => ei !== vehicle.currentEdge);
  if (incident.length === 0) {
    vehicle.towardEnd = !vehicle.towardEnd;
    vehicle.t = vehicle.towardEnd ? 0 : 1;
    return;
  }
  const nextEdgeIdx = incident[Math.floor(Math.random() * incident.length)];
  const nextEdge = edges[nextEdgeIdx];
  const fromNext = nextEdge.fromNodeIdx === atNode;
  vehicle.currentEdge = nextEdgeIdx;
  vehicle.targetNode = fromNext ? nextEdge.toNodeIdx : nextEdge.fromNodeIdx;
  vehicle.towardEnd = fromNext;
  vehicle.t = fromNext ? 0 : 1;
}

function advanceVehicle(graph, vehicle) {
  const edge = graph.edges[vehicle.currentEdge];
  const segLen = edge.lengthM;
  const dist = vehicle.speedMetersPerSecond * DT_SECONDS;
  const deltaT = dist / segLen;
  const dir = vehicle.towardEnd ? 1 : -1;
  let t = vehicle.t + dir * deltaT;

  while (t > 1 || t < 0) {
    if (t >= 1) {
      const carry = (t - 1) * segLen;
      pickNextEdge(graph, vehicle);
      const nextEdge = graph.edges[vehicle.currentEdge];
      if (!nextEdge || carry <= 0) {
        vehicle.t = vehicle.towardEnd ? 0 : 1;
        return;
      }
      const nextLen = nextEdge.lengthM;
      vehicle.t = vehicle.towardEnd ? carry / nextLen : 1 - carry / nextLen;
      return;
    }
    if (t <= 0) {
      const carry = -t * segLen;
      pickNextEdge(graph, vehicle);
      const nextEdge = graph.edges[vehicle.currentEdge];
      if (!nextEdge || carry <= 0) {
        vehicle.t = vehicle.towardEnd ? 0 : 1;
        return;
      }
      const nextLen = nextEdge.lengthM;
      vehicle.t = vehicle.towardEnd ? carry / nextLen : 1 - carry / nextLen;
      return;
    }
  }
  vehicle.t = t;
}

function positionOf(graph, vehicle) {
  const edge = graph.edges[vehicle.currentEdge];
  const dist = vehicle.t * edge.lengthM;
  return pointAtDistanceM(edge.coords, edge.lengthM, dist);
}

function toMapPoint(vehicle, [lat, lng]) {
  return {
    id: vehicle.id,
    type: vehicle.type,
    lat,
    lng,
    unitId: vehicle.id,
    status: "en route",
  };
}

async function main() {
  const graph = await loadGraph();
  const vehicles = spawnVehicles(graph);

  const TICKS_PER_WRITE = Math.round(WRITE_INTERVAL_MS / 1000 / DT_SECONDS);
  let tickCount = 0;

  const tick = () => {
    for (const v of vehicles) advanceVehicle(graph, v);
    tickCount++;
    if (tickCount >= TICKS_PER_WRITE) {
      tickCount = 0;
      const points = vehicles.map((v) => toMapPoint(v, positionOf(graph, v)));
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(points), "utf8");
      process.stdout.write(".");
    }
  };

  const points0 = vehicles.map((v) => toMapPoint(v, positionOf(graph, v)));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(points0), "utf8");
  const interval = setInterval(tick, DT_SECONDS * 1000);

  const shutdown = () => {
    clearInterval(interval);
    const points = vehicles.map((v) => toMapPoint(v, positionOf(graph, v)));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(points), "utf8");
    console.log("\nShutdown. Final positions written.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Simulating ${vehicles.length} vehicles. Writing to ${OUTPUT_PATH} every ${WRITE_INTERVAL_MS}ms. Ctrl+C to stop.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
