# Simulated Emergency Vehicles

Simulates ~40 fire, ~300 police, and ~20 ambulance vehicles on San Francisco roads. **The simulation runs in-process with the Express server** when you start the backend.

## Data Files

| File | Purpose |
|------|---------|
| `backend/data/sf-roads.json` | GeoJSON road LineStrings (from Overpass) |
| `backend/data/sf-roads-graph.json` | Pre-built graph for fast startup |

**Commit decision:** Consider committing `sf-roads.json` and `sf-roads-graph.json` so others don't need Overpass or a build step.

## One-Time Setup

```bash
cd backend

# 1. Fetch SF roads from Overpass API
npm run fetch-sf-roads

# 2. Build road graph
npm run build-roads-graph
```

## Running

The simulation starts automatically when you run the backend:

```bash
cd backend
npm run dev
# or: npm start
```

Vehicle positions are kept in memory. GET /api/vehicles returns the current state.

## API

**GET /api/vehicles** — Returns array of MapPoint-compatible objects:

```json
[
  {
    "id": "fire-1",
    "type": "fire",
    "lat": 37.78,
    "lng": -122.42,
    "unitId": "fire-1",
    "officerInCharge": "Marcus Chen",
    "status": true
  },
  ...
]
```

- `officerInCharge`: string, officer name assigned to the unit
- `status`: boolean — `true` = en route, `false` = idle (roaming/available)

- Ensure the backend server is running (`npm run dev` or `npm start`)
- Frontend can poll every 1s and merge with 911/call points into `mapPoints`
- CORS is enabled; same-origin or configured origins can poll

## Architecture

- **File-based:** Simulator writes to file; Express reads file on each GET. Keeps simulation and server decoupled.
- **No runtime Overpass/OSRM:** All movement uses the pre-loaded graph.
