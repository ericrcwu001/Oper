/**
 * Road-based routing using A* on the SF road graph.
 * Returns polyline coordinates (GeoJSON [lng, lat]), distance in meters, and ETA.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { haversineMeters } from '../utils/geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const GRAPH_PATH = path.join(DATA_DIR, 'sf-roads-graph.json');

/** Average speed m/s per vehicle type (matches proximityRanking). */
const SPEED_AVG = { police: 11, fire: 13, ambulance: 13 };

let graph = null;

function loadGraph() {
  if (graph) return graph;
  if (!fs.existsSync(GRAPH_PATH)) return null;
  graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  return graph;
}

/**
 * Find the graph node index nearest to the given (lat, lng) point.
 * @param {{ lat: number, lng: number }} point
 * @returns {number | null} Node index or null if no graph
 */
function nearestNode(point) {
  const g = loadGraph();
  if (!g || !g.nodes?.length) return null;
  let bestIdx = 0;
  let bestDist = Infinity;
  const target = [point.lat, point.lng];
  for (let i = 0; i < g.nodes.length; i++) {
    const d = haversineMeters(g.nodes[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * A* pathfinding from startNode to goalNode.
 * @param {number} startNodeIdx
 * @param {number} goalNodeIdx
 * @returns {{ edgeIndices: number[], distanceM: number } | null}
 */
function astar(startNodeIdx, goalNodeIdx) {
  const g = loadGraph();
  if (!g) return null;
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

/**
 * Greedy path from startNode toward goal: at each node, pick the edge that gets closest to goal.
 * Mirrors vehicle simulation steering - produces a road-following path that matches how vehicles move.
 * @param {number} startNodeIdx
 * @param {[number, number]} goalPos - [lat, lng]
 * @param {number} maxSteps - prevent infinite loops
 * @returns {{ edgeIndices: number[], distanceM: number, endNodeIdx: number } | null}
 */
function greedyPathTowardGoal(startNodeIdx, goalPos, maxSteps = 2000) {
  const g = loadGraph();
  if (!g) return null;
  const { nodes, edges, adjacency } = g;
  const edgeIndices = [];
  let currentIdx = startNodeIdx;
  let distanceM = 0;
  const visited = new Set();

  for (let step = 0; step < maxSteps; step++) {
    const distToGoal = haversineMeters(nodes[currentIdx], goalPos);
    if (distToGoal < ARRIVAL_RADIUS_M) break;

    const incident = adjacency[currentIdx] || [];
    let bestEdgeIdx = -1;
    let bestNextIdx = -1;
    let bestDist = Infinity;

    for (const edgeIdx of incident) {
      const edge = edges[edgeIdx];
      const nextIdx = edge.fromNodeIdx === currentIdx ? edge.toNodeIdx : edge.fromNodeIdx;
      const d = haversineMeters(nodes[nextIdx], goalPos);
      if (d < bestDist) {
        bestDist = d;
        bestEdgeIdx = edgeIdx;
        bestNextIdx = nextIdx;
      }
    }
    if (bestEdgeIdx < 0) break;
    if (visited.has(bestNextIdx)) break;
    visited.add(currentIdx);

    const edge = edges[bestEdgeIdx];
    edgeIndices.push(bestEdgeIdx);
    distanceM += edge.lengthM;
    currentIdx = bestNextIdx;
  }

  if (edgeIndices.length === 0) return null;
  return { edgeIndices, distanceM, endNodeIdx: currentIdx };
}

/** When a dispatched vehicle is within this distance (m) of target, it has arrived. */
const ARRIVAL_RADIUS_M = 50;

/**
 * Dijkstra from startNode to find shortest path to all reachable nodes.
 * @param {number} startNodeIdx
 * @returns {Map<number, { distanceM: number, edgeIndices: number[] }>} nodeIdx -> path info
 */
function dijkstraReachable(startNodeIdx) {
  const g = loadGraph();
  if (!g) return new Map();
  const { nodes, edges, adjacency } = g;
  const result = new Map();
  const pq = [{ nodeIdx: startNodeIdx, distanceM: 0, edgeIndices: [] }];
  result.set(startNodeIdx, { distanceM: 0, edgeIndices: [] });

  while (pq.length > 0) {
    pq.sort((a, b) => a.distanceM - b.distanceM);
    const { nodeIdx, distanceM, edgeIndices } = pq.shift();
    for (const edgeIdx of adjacency[nodeIdx] || []) {
      const edge = edges[edgeIdx];
      const nextNodeIdx = edge.fromNodeIdx === nodeIdx ? edge.toNodeIdx : edge.fromNodeIdx;
      const nextDist = distanceM + edge.lengthM;
      const existing = result.get(nextNodeIdx);
      if (!existing || existing.distanceM > nextDist) {
        const nextEdges = [...edgeIndices, edgeIdx];
        result.set(nextNodeIdx, { distanceM: nextDist, edgeIndices: nextEdges });
        pq.push({ nodeIdx: nextNodeIdx, distanceM: nextDist, edgeIndices: nextEdges });
      }
    }
  }
  return result;
}

/**
 * Build GeoJSON LineString coordinates from edge indices.
 * Graph edge coords are [lat, lng][]; GeoJSON/MapLibre wants [lng, lat][].
 */
function buildPolylineFromEdges(edgeIndices, fromNodeIdx, toNodeIdx, fromLatLng, toLatLng) {
  const g = loadGraph();
  if (!g || !edgeIndices.length) return [];

  const { nodes, edges } = g;
  const toGeoJSON = (lat, lng) => [lng, lat];
  const out = [];
  out.push(toGeoJSON(fromLatLng.lat, fromLatLng.lng));

  let prevNodeIdx = fromNodeIdx;
  for (const edgeIdx of edgeIndices) {
    const edge = edges[edgeIdx];
    const coords = edge.coords || [];
    const fromIdx = edge.fromNodeIdx;
    const toIdx = edge.toNodeIdx;
    const rev = prevNodeIdx === toIdx;
    const pts = rev ? [...coords].reverse() : coords;
    for (let i = 1; i < pts.length; i++) {
      out.push(toGeoJSON(pts[i][0], pts[i][1]));
    }
    prevNodeIdx = rev ? fromIdx : toIdx;
  }
  out.push(toGeoJSON(toLatLng.lat, toLatLng.lng));
  return out;
}

/**
 * Find route from a point to another point on the road graph.
 * Always returns a road-following path when possible. If vehicle and incident are in
 * disconnected graph components, routes along roads to the nearest reachable point, then
 * a short straight segment to the incident.
 * @param {{ lat: number, lng: number }} from - Start (e.g. vehicle position)
 * @param {{ lat: number, lng: number }} to - End (e.g. incident location)
 * @param {{ speedMps?: number }} [options] - Optional speed for ETA (default 11 m/s)
 * @returns {{ coords: [number, number][], distanceM: number, etaSec: number } | null}
 */
export function findRoute(from, to, options = {}) {
  const g = loadGraph();
  if (!g) return null;

  const fromNode = nearestNode(from);
  const toNode = nearestNode(to);
  if (fromNode == null || toNode == null) return null;

  const fromPos = { lat: from.lat, lng: from.lng };
  const toPos = { lat: to.lat, lng: to.lng };
  const speed = options.speedMps ?? 11;
  const toGeoJSON = (lat, lng) => [lng, lat];

  if (fromNode === toNode) {
    const distanceM = haversineMeters([from.lat, from.lng], [to.lat, to.lng]);
    return {
      coords: [toGeoJSON(from.lat, from.lng), toGeoJSON(to.lat, to.lng)],
      distanceM,
      etaSec: Math.round(distanceM / speed),
    };
  }

  let result = astar(fromNode, toNode);

  if (!result) {
    // Fallback 1: Greedy path - mirrors vehicle sim steering, always produces road-following path.
    const goalPos = [to.lat, to.lng];
    const greedy = greedyPathTowardGoal(fromNode, goalPos);
    if (greedy && greedy.edgeIndices.length > 0) {
      const endPos = g.nodes[greedy.endNodeIdx];
      const lastSegM = haversineMeters(endPos, goalPos);
      const distanceM = greedy.distanceM + lastSegM;
      const coords = buildPolylineFromEdges(
        greedy.edgeIndices,
        fromNode,
        greedy.endNodeIdx,
        fromPos,
        { lat: endPos[0], lng: endPos[1] }
      );
      if (lastSegM > 1) coords.push(toGeoJSON(to.lat, to.lng));
      return { coords, distanceM, etaSec: Math.round(distanceM / speed) };
    }

    // Fallback 2: Dijkstra - vehicle and incident in disconnected components.
    const straightDist = haversineMeters([from.lat, from.lng], [to.lat, to.lng]);
    const maxRoadM = Math.min(50000, straightDist * 3);
    const reachable = dijkstraReachable(fromNode);
    let bestNodeIdx = null;
    let bestRoadDist = Infinity;
    let bestPath = null;
    for (const [nodeIdx, path] of reachable.entries()) {
      if (path.distanceM > maxRoadM) continue;
      const nodePos = g.nodes[nodeIdx];
      const distToGoal = haversineMeters(nodePos, goalPos);
      if (distToGoal < bestRoadDist) {
        bestRoadDist = distToGoal;
        bestNodeIdx = nodeIdx;
        bestPath = path;
      }
    }
    if (!bestPath || bestPath.edgeIndices.length === 0) return null;

    const closestNodePos = g.nodes[bestNodeIdx];
    const lastSegM = haversineMeters(closestNodePos, goalPos);
    const distanceM = bestPath.distanceM + lastSegM;
    const coords = buildPolylineFromEdges(
      bestPath.edgeIndices,
      fromNode,
      bestNodeIdx,
      fromPos,
      { lat: closestNodePos[0], lng: closestNodePos[1] }
    );
    coords.push(toGeoJSON(to.lat, to.lng));
    return { coords, distanceM, etaSec: Math.round(distanceM / speed) };
  }

  const coords = buildPolylineFromEdges(result.edgeIndices, fromNode, toNode, fromPos, toPos);
  const distanceM = result.distanceM;
  const etaSec = Math.round(distanceM / speed);
  return { coords, distanceM, etaSec };
}

/**
 * Find route with type-specific speed for ETA.
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {string} vehicleType - 'police' | 'fire' | 'ambulance'
 */
export function findRouteForVehicle(from, to, vehicleType) {
  const speed = SPEED_AVG[vehicleType] ?? 11;
  return findRoute(from, to, { speedMps: speed });
}
