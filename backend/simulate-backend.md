# Simulated Emergency Vehicles Backend – To-Do List

A detailed breakdown of sub-tasks for implementing the backend script. Order matters: earlier tasks block later ones.

---

## Phase 1: Data & One-Time Setup

### 1.1 Create data directory and structure
- [ ] Create `backend/data/` directory if it does not exist
- [ ] Add `.gitkeep` or placeholder so the directory is tracked
- [ ] Ensure `backend/data/` is in `.gitignore` only for generated outputs (or not, if committing roads/graph) — document decision

### 1.2 Implement fetch-sf-roads.js
- [ ] Create `backend/scripts/fetch-sf-roads.js`
- [ ] Define SF bounding box: `[37.7, -122.52]` to `[37.83, -122.35]` (align with `frontend/lib/map-constants.ts`)
- [ ] Write Overpass API query for `way["highway"]` in SF bbox
- [ ] Exclude non-drivable types: `footway`, `cycleway`, `path`, `steps`, `pedestrian`
- [ ] Optionally restrict to drivable types only to reduce size
- [ ] Add `[timeout:...]` and `[maxsize:...]` to Overpass query
- [ ] Add retry with exponential backoff for transient failures
- [ ] Convert Overpass response to GeoJSON FeatureCollection of LineStrings
- [ ] Write output to `backend/data/sf-roads.json`
- [ ] Add npm script: `"fetch-sf-roads": "node backend/scripts/fetch-sf-roads.js"`
- [ ] Run script once and verify output; document if committing `sf-roads.json`

### 1.3 Implement haversine helper
- [ ] Add `haversineMeters(a, b)` in shared location (e.g. `backend/src/utils/geo.js` or inside build script)
- [ ] Use Earth radius `R = 6371000` m
- [ ] Use formula from plan for lat/lng pairs

### 1.4 Implement build-roads-graph.js – core logic
- [ ] Create `backend/scripts/build-roads-graph.js`
- [ ] Read `backend/data/sf-roads.json`
- [ ] Parse GeoJSON FeatureCollection; for each LineString:
  - [ ] Extract coordinate array
  - [ ] Compute total segment length (haversine sum along coords)
  - [ ] **Node deduplication**: Round coords to 5–6 decimals for key; lookup/create node by key
  - [ ] **Subdivision**: If segment length > 200 m, subdivide into ~200 m chunks, insert intermediate nodes
  - [ ] Create edge(s) with `fromNodeIdx`, `toNodeIdx`, `lengthM`, `coords`
- [ ] Build adjacency map: `nodeIdx -> [edgeIdx, ...]`
- [ ] Output graph object: `{ nodes: [[lat,lng], ...], edges: [...], adjacency: {...} }`
- [ ] Write to `backend/data/sf-roads-graph.json`
- [ ] Add npm script: `"build-roads-graph": "node backend/scripts/build-roads-graph.js"`

### 1.5 Implement point-at-distance helper (polyline interpolation)
- [ ] Add `pointAtDistanceM(coords, segmentLengthM, distanceM)` helper
- [ ] Walk `coords` array, sum haversine distances until cumulative ≥ `distanceAlong`
- [ ] Interpolate within sub-segment to get `(lat, lng)`
- [ ] Used when converting `(currentEdge, t)` to position — avoids corner-cutting on curved roads

---

## Phase 2: Simulation Engine

### 2.1 Graph loading logic
- [ ] In simulator: check if `sf-roads-graph.json` exists
- [ ] If yes: load graph from file
- [ ] If no: run build logic (or call `build-roads-graph.js`), optionally write graph for next time
- [ ] Ensure `sf-roads.json` exists or provide clear error

### 2.2 Vehicle state model
- [ ] Define per-vehicle state: `currentEdge`, `t`, `targetNode`, `speedMetersPerSecond`
- [ ] Add `type`: `"fire"` | `"police"` | `"ambulance"`
- [ ] Add `id`: e.g. `fire-1`, `police-42`, `ambulance-3`

### 2.3 Vehicle spawning
- [ ] Spawn ~40 fire, ~300 police, ~20 ambulance (360 total)
- [ ] Assign each vehicle a random initial edge and `t` (or start at random node)
- [ ] Set `speedMetersPerSecond` per type (fire/ambulance slightly faster than police) + small random factor
- [ ] Example: police ~11 m/s (25 mph), fire/ambulance ~13 m/s (30 mph)

### 2.4 Tick loop – advance logic
- [ ] Fix `dtSeconds` (e.g. 0.1 s for 10 Hz)
- [ ] For each vehicle: `deltaT = (speedMetersPerSecond * dtSeconds) / segmentLengthM`
- [ ] Advance `t` by `deltaT` in direction of travel
- [ ] When `t` crosses 1 (or 0): snap to node
- [ ] Choose next edge: uniformly among edges incident to node (optionally exclude edge just used)
- [ ] Set `currentEdge`, `t`, `targetNode` for new segment
- [ ] Handle carry-over for overshoot (optional, for smoother motion)

### 2.5 Position computation
- [ ] Given `(currentEdge, t)`, compute `(lat, lng)` using `pointAtDistanceM`
- [ ] Use `t * segmentLengthM` as distance along segment

### 2.6 Output writing
- [ ] Format: array of `{ id, type, lat, lng, unitId?, status? }` (MapPoint-compatible)
- [ ] Write to `backend/data/vehicle-positions.json` every 1 s (configurable)
- [ ] Ensure file exists and is valid JSON before first write

### 2.7 Main simulator script
- [ ] Create `backend/scripts/simulate-emergency-vehicles.js`
- [ ] Orchestrate: load graph → spawn vehicles → tick loop → write output
- [ ] Add graceful shutdown (SIGINT/SIGTERM) to flush final state
- [ ] Add npm script: `"simulate-vehicles": "node backend/scripts/simulate-emergency-vehicles.js"`

---

## Phase 3: API (Optional)

### 3.1 Vehicles route
- [ ] Create `backend/src/routes/vehicles.js`
- [ ] Implement GET `/api/vehicles` that reads `vehicle-positions.json` and returns array
- [ ] Or: keep positions in-memory in simulator and expose via shared state (if simulator runs in-process)
- [ ] Return 404 or empty array if file missing / simulation not running

### 3.2 Mount route in Express
- [ ] Import vehicles route in `backend/src/index.js`
- [ ] Mount at `/api/vehicles`

### 3.3 CORS / frontend readiness
- [ ] Ensure CORS allows frontend origin if different
- [ ] Document that frontend can poll every 1 s

---

## Phase 4: Polish & Decisions

### 4.1 Open decisions
- [ ] **Commit data**: Decide whether to commit `sf-roads.json` and/or `sf-roads-graph.json`; document in README
- [ ] **In-memory vs file**: Confirm file-based design (simulator writes, Express reads) vs in-process

### 4.2 Documentation
- [ ] Add README section or `backend/docs/SIMULATED_VEHICLES.md` with:
  - How to run `fetch-sf-roads` (one-time)
  - How to run `build-roads-graph` (one-time or when roads change)
  - How to run `simulate-vehicles`
  - Optional: how frontend polls `/api/vehicles`

### 4.3 Validation
- [ ] Run full pipeline: fetch → build → simulate
- [ ] Verify `vehicle-positions.json` updates and contains valid MapPoint-shaped objects
- [ ] Optionally: quick sanity check that positions stay within SF bounds

---

## Dependency Graph (Blocking)

```
1.1 (data dir)
  └─ 1.2 (fetch roads) ──────────────────┐
  └─ 1.3 (haversine) ──┐                 │
  └─ 1.5 (pointAtDist) ─┼─ 1.4 (build graph)
                        │                 │
                        └─────────────────┴─ 2.1 (load graph)
                                               └─ 2.2, 2.3, 2.4, 2.5, 2.6
                                                      └─ 2.7 (main script)
                                                             └─ 3.1, 3.2, 3.3 (API)
```

---

## Estimated Effort (Rough)

| Phase   | Tasks | Relative effort |
|---------|-------|-----------------|
| Phase 1 | 5     | High (data + graph) |
| Phase 2 | 7     | High (simulation core) |
| Phase 3 | 3     | Low |
| Phase 4 | 3     | Low |

Suggested order: 1.1 → 1.3 → 1.2 → 1.4 → 1.5 → 2.1–2.7 → 3.1–3.3 → 4.x
