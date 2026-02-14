import type { MapPointType } from "./map-types"

/** SF bounding box [SW lng/lat, NE lng/lat]. Pan restricted to this area. */
export const SF_BOUNDS: [[number, number], [number, number]] = [
  [-122.52, 37.7],
  [-122.35, 37.83],
]

/** Default map center (SF). */
export const SF_DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749]

/** Default zoom level. */
export const SF_DEFAULT_ZOOM = 11

/** Fill color per point type (hex). */
export const MAP_POINT_COLORS: Record<MapPointType, string> = {
  "911": "#EF4444",
  police: "#3B82F6",
  fire: "#F97316",
  ambulance: "#22C55E",
}

/** Outline color for points (matches map background). */
export const MAP_POINT_OUTLINE_COLOR = "#0B0C0E"

/** MapLibre zoom → circle radius (px). [zoom, radius] pairs for interpolate. */
export const MAP_POINT_RADIUS_BY_ZOOM: [number, number][] = [
  [11, 3],
  [14, 5],
  [16, 7],
]

/** Extra radius when point is selected (px). */
export const MAP_POINT_SELECTED_RADIUS_OFFSET = 2.5

/**
 * PMTiles URL for vector basemap. Prefer local copy at /tiles/sf.pmtiles (see frontend/public/tiles/).
 * Fallback: build channel (see frontend/docs/PROTOMAPS_SETUP.md). For production, host your own copy.
 */
export const PMTILES_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tiles/sf.pmtiles`
    : "https://build.protomaps.com/20260214.pmtiles"
