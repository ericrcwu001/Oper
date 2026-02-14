# Connecting to Protomaps for the SF Map

This doc describes how to connect the live-call SF map to **Protomaps** vector tiles using the **PMTiles** format and MapLibre GL JS.

## 1. Install dependencies

In the frontend (Next.js) app:

```bash
pnpm add maplibre-gl pmtiles
pnpm add -D @types/maplibre-gl
```

- **maplibre-gl**: Map renderer (no API key).
- **pmtiles**: Lets MapLibre fetch vector tiles from a PMTiles URL via a custom protocol.

## 2. Register the PMTiles protocol once

MapLibre needs the `pmtiles://` protocol registered **once** in the app lifecycle. In React/Next.js, do this in the component that creates the map (or in a root layout effect).

**Option A – Inside the map component (recommended)**  
In `frontend/components/sf-map.tsx` (or wherever you init the map):

```ts
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

// Register protocol once per app load
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

export function SFMap({ points, ... }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensurePmtilesProtocol();
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(), // your custom style (see below)
      center: [-122.4194, 37.7749],
      zoom: 11,
      maxBounds: [[-122.52, 37.70], [-122.35, 37.83]],
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

**Option B – App-wide in layout**  
If you prefer to register in one place (e.g. `app/layout.tsx`):

```ts
"use client";
import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

export default function Layout({ children }) {
  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => maplibregl.removeProtocol("pmtiles");
  }, []);
  return <>{children}</>;
}
```

## 3. PMTiles URL for the vector source

Your MapLibre style must include a **vector** source that uses the `pmtiles://` prefix so the protocol handler can fetch tiles.

### 3.1 Recommended: host your own copy

Protomaps [discourages hotlinking](https://docs.protomaps.com/basemaps/downloads) to their build channel. For production:

1. Download a build from [maps.protomaps.com/builds](https://maps.protomaps.com/builds) (or a regional extract).
2. Upload the `.pmtiles` file to your own storage (e.g. S3, GCS, Cloudflare R2) with public read access.
3. Use that URL in the style:

```json
{
  "sources": {
    "protomaps": {
      "type": "vector",
      "url": "pmtiles://https://your-bucket.s3.amazonaws.com/your-file.pmtiles",
      "attribution": "© Protomaps © OpenStreetMap"
    }
  }
}
```

### 3.2 Development / demo: build channel (use sparingly)

For local/dev only, you can point at a current build. Builds are dated; replace the date with the latest from [maps.protomaps.com/builds](https://maps.protomaps.com/builds):

```json
"url": "pmtiles://https://build.protomaps.com/20250214.pmtiles"
```

Or the Source Cooperative mirror (single latest build):

```json
"url": "pmtiles://https://r2-public.protomaps.com/builds/20250214.pmtiles"
```

Check the [Protomaps downloads](https://docs.protomaps.com/basemaps/downloads) and [builds](https://maps.protomaps.com/builds) pages for current URLs and version compatibility (e.g. v4 style).

### 3.3 SF-only: regional extract (optional)

To keep data small and SF-only:

1. Install [PMTiles CLI](https://docs.protomaps.com/pmtiles/cli): `npm install -g pmtiles`
2. Download a full build (or use a small area from build.protomaps.com).
3. Extract a bounding box for SF:

```bash
pmtiles extract input.pmtiles output.pmtiles --bbox=-122.52,37.70,-122.35,37.83 --maxzoom=14
```

4. Host `output.pmtiles` and use it in the source `url` as in 3.1.

If you don’t extract, using the full planet with `maxBounds` (as in the map options above) still restricts panning to SF; only tile payload is larger.

## 4. Minimal custom style using Protomaps

Your style should include the Protomaps source and only the layers you need (e.g. background, waterway lines, road layers) with your muted greyscale and a hint of cool (default greyscale-ish). No need to use Protomaps’ full basemap layers (labels, POIs, etc.).

Example minimal style structure (inline or in `frontend/data/sf-map-style.json`):

```json
{
  "version": 8,
  "sources": {
    "protomaps": {
      "type": "vector",
      "url": "pmtiles://https://YOUR_HOSTED_PMTILES_URL.pmtiles",
      "attribution": "© Protomaps © OpenStreetMap"
    }
  },
  "layers": [
    { "id": "background", "type": "background", "paint": { "background-color": "#0B0C0E" } },
    { "id": "waterway", "type": "line", "source": "protomaps", "source-layer": "waterway", "paint": { "line-color": "#1B1E22", "line-width": 0.5, "line-opacity": 0.6 } },
    { "id": "roads-minor", "type": "line", "source": "protomaps", "source-layer": "roads", "filter": ["in", "class", "street", "street_limited", "service"], "paint": { "line-color": "#434a54", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.3, 16, 1.05 ], "line-opacity": 0.45 } },
    { "id": "roads-mid", "type": "line", "source": "protomaps", "source-layer": "roads", "filter": ["in", "class", "primary", "secondary", "tertiary"], "paint": { "line-color": "#6b7280", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 2.6 ], "line-opacity": 0.85 } },
    { "id": "roads-major", "type": "line", "source": "protomaps", "source-layer": "roads", "filter": ["in", "class", "motorway", "trunk"], "paint": { "line-color": "#9ca3af", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 16, 5.6 ], "line-opacity": 1 } }
  ]
}
```

You’ll need to align `source-layer` and property names (e.g. `class`) with the [Protomaps schema]. **Muted palette:**  background #0B0C0E; waterway #1B1E22; local #434a54; mid #6b7280; highways #9ca3af (greyscale with a hint of cool).(https://github.com/protomaps/basemaps/tree/main/docs). The [Protomaps MapLibre basemap docs](https://docs.protomaps.com/basemaps/maplibre) and [@protomaps/basemaps](https://www.npmjs.com/package/@protomaps/basemaps) package describe the layer/field names if you want to reuse their layer logic with a custom flavor.

## 5. Summary

| Step | Action |
|------|--------|
| 1 | `pnpm add maplibre-gl pmtiles` (and `@types/maplibre-gl` as dev) |
| 2 | Register once: `new Protocol()` then `maplibregl.addProtocol("pmtiles", protocol.tile)` |
| 3 | In your style, set a vector source with `"url": "pmtiles://https://..."` (your hosted file or, for dev only, a build URL) |
| 4 | Restrict to SF with `maxBounds`; optionally use an SF-only PMTiles extract and host it yourself |

No API key is required; the only requirement is a public URL to a `.pmtiles` file (your own or, for dev, the build channel).
