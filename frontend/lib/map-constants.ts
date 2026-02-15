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
  crime: "#FCD34D", // Amber so crime dots stand out on dark map
}

/** Crime points: larger radius and visible stroke so they’re more apparent. */
export const CRIME_POINT_RADIUS_BY_ZOOM: [number, number][] = [
  [11, 6],
  [14, 10],
  [16, 14],
]

/** Stroke color for crime dots (high visibility). */
export const CRIME_POINT_STROKE_COLOR = "#F97316"

/** Outline color for points (matches map background). */
export const MAP_POINT_OUTLINE_COLOR = "#0B0C0E"

/** 911 call marker stroke (high visibility). */
export const MAP_POINT_911_STROKE_COLOR = "#FFFFFF"

/** MapLibre zoom → circle radius (px). [zoom, radius] pairs for interpolate. */
export const MAP_POINT_RADIUS_BY_ZOOM: [number, number][] = [
  [11, 3],
  [14, 5],
  [16, 7],
]

/** 911 call marker: larger so it’s the most prominent point on the map. */
export const MAP_POINT_911_RADIUS_BY_ZOOM: [number, number][] = [
  [11, 7],
  [14, 11],
  [16, 15],
]

/** Zoom → radius for selected points (base + offset). Used in a separate layer so zoom stays top-level. */
export const MAP_POINT_RADIUS_SELECTED_BY_ZOOM: [number, number][] = [
  [11, 5.5],
  [14, 7.5],
  [16, 9.5],
]

/** Slightly smaller radius for police, fire, ambulance units. */
export const MAP_POINT_RADIUS_UNIT_BY_ZOOM: [number, number][] = [
  [11, 2],
  [14, 3.5],
  [16, 5],
]

/** Selected radius for police, fire, ambulance (slightly smaller). */
export const MAP_POINT_RADIUS_UNIT_SELECTED_BY_ZOOM: [number, number][] = [
  [11, 4],
  [14, 5.5],
  [16, 7],
]

/** Scale factor for unit circle radius when idle (available). En route = 1, idle = this value (25% larger). */
export const MAP_POINT_UNIT_IDLE_RADIUS_SCALE = 1.25

/** 911 call marker when selected (slightly larger than base 911 radius). */
export const MAP_POINT_911_RADIUS_SELECTED_BY_ZOOM: [number, number][] = [
  [11, 9],
  [14, 13],
  [16, 17],
]

/** Extra radius when point is selected (px). */
export const MAP_POINT_SELECTED_RADIUS_OFFSET = 2.5

/** Base height for beacon extrusions (meters). Slightly above 0 to avoid z-fighting at the bottom. */
export const MAP_POINT_BEACON_BASE_M = 2

/** 911 beacon extrusion height in meters (visible when map is tilted in 3D). */
export const MAP_POINT_911_BEACON_HEIGHT_M = 750

/** 911 beacon color (neon red, transparent but bright). */
export const MAP_POINT_911_BEACON_COLOR = "#FF336680"

/** 911 beacon footprint half-side in degrees (~25m at SF latitude). */
export const MAP_POINT_911_BEACON_FOOTPRINT = 0.00022

/** Crime beacon extrusion height in meters (shorter than 911 in 3D). Default when priority is missing. */
export const MAP_POINT_CRIME_BEACON_HEIGHT_M = 400

/** Crime beacon height by priority (1–5). Higher priority = taller beacon. */
export const MAP_POINT_CRIME_BEACON_HEIGHT_BY_PRIORITY: Record<number, number> = {
  1: 200,
  2: 300,
  3: 400,
  4: 550,
  5: 750,
}

/** Crime beacon color (yellow to match crime points, transparent but bright). */
export const MAP_POINT_CRIME_BEACON_COLOR = "#FDE04780"

/** Crime beacon opacity by priority (1–5). Higher priority = more solid. */
export const MAP_POINT_CRIME_BEACON_OPACITY_BY_PRIORITY: Record<number, number> = {
  1: 0.25,
  2: 0.4,
  3: 0.65,
  4: 0.8,
  5: 0.95,
}

/** Crime beacon footprint half-side in degrees (smaller than 911). */
export const MAP_POINT_CRIME_BEACON_FOOTPRINT = 0.00012

/** Min separation (deg) between crime beacon centers so they don't overlap. Skip loading a crime if within this of another. */
export const CRIME_BEACON_MIN_SEPARATION_DEG = 0.013

/** Stroke for "recommended" (closest available) unit highlight ring on the map. Bright pink for contrast with blue/orange/green dots. */
export const MAP_POINT_RECOMMENDED_STROKE_COLOR = "#E879F9"

/** Zoom → radius (px) for the recommended-unit ring (slightly larger than unit circle). */
export const MAP_POINT_RECOMMENDED_RING_RADIUS_BY_ZOOM: [number, number][] = [
  [11, 3.5],
  [14, 6],
  [16, 8.5],
]

/** Min zoom for inline labels: 911 and crime show earlier (more important). */
export const MAP_LABEL_ZOOM_911 = 13
export const MAP_LABEL_ZOOM_CRIME = 13
/** Min zoom for crime labels by priority (1–5). Higher priority = lower zoom = label visible when more zoomed out. */
export const MAP_LABEL_ZOOM_CRIME_BY_PRIORITY: Record<number, number> = {
  1: 14,
  2: 13,
  3: 13,
  4: 12,
  5: 12,
}
/** Units require more zoom to reduce clutter. */
export const MAP_LABEL_ZOOM_UNITS = 15

/** Vehicle route line (A* path to crime when vehicle is selected and en route). Semi-transparent blue. */
export const MAP_ROUTE_LINE_COLOR = "#3B82F880"
export const MAP_ROUTE_LINE_WIDTH = 3

/**
 * PMTiles URL for vector basemap. Prefer local copy at /tiles/sf.pmtiles (see frontend/public/tiles/).
 * Fallback: build channel (see frontend/docs/PROTOMAPS_SETUP.md). For production, host your own copy.
 */
export const PMTILES_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tiles/sf.pmtiles`
    : "https://build.protomaps.com/20260214.pmtiles"
