"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import maplibregl from "maplibre-gl"
import { Protocol } from "pmtiles"
import "maplibre-gl/dist/maplibre-gl.css"
import type { MapPoint } from "@/lib/map-types"
import {
  SF_BOUNDS,
  SF_DEFAULT_CENTER,
  SF_DEFAULT_ZOOM,
  MAP_POINT_COLORS,
  MAP_POINT_OUTLINE_COLOR,
  MAP_POINT_RADIUS_SELECTED_BY_ZOOM,
  MAP_POINT_RADIUS_UNIT_BY_ZOOM,
  MAP_POINT_RADIUS_UNIT_SELECTED_BY_ZOOM,
  CRIME_POINT_RADIUS_BY_ZOOM,
  MAP_POINT_911_BEACON_HEIGHT_M,
  MAP_POINT_911_BEACON_COLOR,
  MAP_POINT_CRIME_BEACON_HEIGHT_M,
  MAP_POINT_CRIME_BEACON_COLOR,
  MAP_POINT_CRIME_BEACON_FOOTPRINT,
  MAP_POINT_911_STROKE_COLOR,
  CRIME_POINT_STROKE_COLOR,
  MAP_POINT_RECOMMENDED_STROKE_COLOR,
  MAP_POINT_RECOMMENDED_RING_RADIUS_BY_ZOOM,
  MAP_LABEL_ZOOM_911,
  MAP_LABEL_ZOOM_CRIME,
  MAP_LABEL_ZOOM_UNITS,
} from "@/lib/map-constants"
import { getSFMapStyle } from "@/lib/map-style"

let protocolRegistered = false
function ensurePmtilesProtocol() {
  if (protocolRegistered) return
  const protocol = new Protocol()
  maplibregl.addProtocol("pmtiles", protocol.tile)
  protocolRegistered = true
}

function pointsToGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        type: p.type,
        selected: p.selected ?? false,
        disabled: p.disabled ?? false,
        radiusScale: p.radiusScale ?? 1,
        recommended: p.recommended ?? false,
        status: p.status === 1 || p.status === true,
      },
    })),
  }
}

/** Same fields as popup, formatted as plain multi-line text for inline labels. */
function getPointLabelText(point: MapPoint): string {
  const coords = `(${point.lng.toFixed(4)}, ${point.lat.toFixed(4)})`
  const is911 = point.type === "911"
  const isCrime = point.type === "crime"
  const fields: { label: string; value?: string }[] = is911
    ? [
        { label: "Location", value: point.location },
        { label: "Description", value: point.description },
        { label: "Caller ID", value: point.callerId },
        { label: "Caller name", value: point.callerName },
        { label: "Time received", value: point.timestamp },
      ]
    : isCrime
      ? [
          { label: "Category", value: point.location },
          { label: "Address", value: point.description },
          { label: "Details", value: point.callerId },
        ]
      : [
          { label: "Location", value: point.location },
          { label: "Officer in charge", value: point.officerInCharge },
          { label: "Unit ID", value: point.unitId },
          {
            label: "Status",
            value:
              typeof point.status === "string"
                ? point.status
                : point.status === true
                  ? "En route"
                  : point.status === false
                    ? "Idle"
                    : "Unknown",
          },
        ]
  const fieldLines = fields
    .filter((f) => f.value != null && f.value !== "")
    .map((f) => `[${f.value}]`)
    .join("\n")
  return fieldLines ? `[${coords}]\n${fieldLines}` : `[${coords}]`
}

/** GeoJSON for label symbol layers: Point features with id, type, and text. */
function pointsToLabelsGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature" as const,
      id: p.id,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        type: p.type,
        text: getPointLabelText(p),
      },
    })),
  }
}

/** Interpolate circle radius (px) from zoom using [zoom, radius] pairs. */
function radiusAtZoom(zoomLevels: [number, number][], zoom: number): number {
  const sorted = [...zoomLevels].sort((a, b) => a[0] - b[0])
  if (zoom <= sorted[0][0]) return sorted[0][1]
  if (zoom >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1]
  for (let i = 0; i < sorted.length - 1; i++) {
    const [z0, r0] = sorted[i]
    const [z1, r1] = sorted[i + 1]
    if (zoom >= z0 && zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0)
      return r0 + t * (r1 - r0)
    }
  }
  return sorted[0][1]
}

/** Convert circle radius (px) at zoom and latitude to radius in degrees (lon direction). MapLibre uses 512 for globe scale. */
function beaconRadiusDegrees(zoom: number, lat: number, radiusPx: number): number {
  const worldSize = 512 * Math.pow(2, zoom)
  const pixelsPerDegreeLon = (worldSize * Math.cos((lat * Math.PI) / 180)) / 360
  return radiusPx / pixelsPerDegreeLon
}

/** Create a circular polygon ring (approximates cylinder when extruded). N vertices. Clockwise for fill-extrusion 3D. */
function circleToRing(centerLng: number, centerLat: number, radiusDegLon: number, segments = 32): [number, number][] {
  const latScale = Math.cos((centerLat * Math.PI) / 180) // so circle appears round on map
  const ring: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const θ = -(2 * Math.PI * i) / segments // clockwise so fill-extrusion renders correctly in 3D
    ring.push([
      centerLng + radiusDegLon * Math.cos(θ),
      centerLat + radiusDegLon * latScale * Math.sin(θ),
    ])
  }
  return ring
}

/** Create an ellipse polygon ring (for 3D perspective). radiusLonDeg = horizontal, radiusLatDeg = vertical (compressed by pitch). */
function ellipseToRing(
  centerLng: number,
  centerLat: number,
  radiusLonDeg: number,
  radiusLatDeg: number,
  segments = 32
): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const θ = -(2 * Math.PI * i) / segments
    ring.push([
      centerLng + radiusLonDeg * Math.cos(θ),
      centerLat + radiusLatDeg * Math.sin(θ),
    ])
  }
  return ring
}

/** Radius in px for a point by type and selected (for ellipse GeoJSON). */
function getRadiusPxForPoint(
  zoom: number,
  type: MapPoint["type"],
  selected: boolean
): number {
  if (type === "911" || type === "crime") {
    const levels = selected ? MAP_POINT_RADIUS_SELECTED_BY_ZOOM.map(([z, r]) => [z, r * 2] as [number, number]) : CRIME_POINT_RADIUS_BY_ZOOM
    return radiusAtZoom(levels, zoom)
  }
  const levels = selected ? MAP_POINT_RADIUS_UNIT_SELECTED_BY_ZOOM : MAP_POINT_RADIUS_UNIT_BY_ZOOM
  return radiusAtZoom(levels, zoom)
}

/** Ellipse GeoJSON for all points; when pitch > 0, lat radius is compressed so points appear as ovals in 3D. */
function pointsToEllipseGeoJSON(
  points: MapPoint[],
  zoom: number,
  pitchDeg: number,
  selectedPointId: string | null
): GeoJSON.FeatureCollection {
  const cosPitch = Math.max(0.1, Math.cos((pitchDeg * Math.PI) / 180))
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = points.map((p) => {
    const selected = p.id === selectedPointId
    const radiusPx = getRadiusPxForPoint(zoom, p.type, selected)
    const radiusLonDeg = beaconRadiusDegrees(zoom, p.lat, radiusPx)
    const radiusLatDeg = radiusLonDeg * cosPitch
    return {
      type: "Feature",
      id: p.id,
      geometry: {
        type: "Polygon",
        coordinates: [ellipseToRing(p.lng, p.lat, radiusLonDeg, radiusLatDeg)],
      },
      properties: {
        id: p.id,
        type: p.type,
        selected: selected,
        disabled: p.disabled ?? false,
        status: p.status === 1 || p.status === true,
      },
    }
  })
  return { type: "FeatureCollection", features }
}

/** Cylindrical beacon polygon around 911 points. Radius in degrees computed per-point so circumference matches circle. */
function points911ToBeaconGeoJSON(points: MapPoint[], zoom: number, radiusPx: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = points
    .filter((p) => p.type === "911")
    .map((p) => {
      const radiusDeg = beaconRadiusDegrees(zoom, p.lat, radiusPx)
      return {
        type: "Feature",
        id: p.id,
        geometry: { type: "Polygon", coordinates: [circleToRing(p.lng, p.lat, radiusDeg)] },
        properties: { id: p.id },
      }
    })
  return { type: "FeatureCollection", features }
}

/** Cylindrical beacon polygon around crime points. Radius in degrees computed per-point so circumference matches circle. */
function pointsCrimeToBeaconGeoJSON(points: MapPoint[], zoom: number, radiusPx: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = points
    .filter((p) => p.type === "crime")
    .map((p) => {
      const radiusDeg = beaconRadiusDegrees(zoom, p.lat, radiusPx)
      return {
        type: "Feature",
        id: p.id,
        geometry: { type: "Polygon", coordinates: [circleToRing(p.lng, p.lat, radiusDeg)] },
        properties: { id: p.id },
      }
    })
  return { type: "FeatureCollection", features }
}

const POINTS_SOURCE_ID = "map-points"
const POINTS_LAYER_ID = "map-points-circles"
const POINTS_LAYER_UNIT_ID = "map-points-circles-unit"
const POINTS_LAYER_SELECTED_ID = "map-points-circles-selected"
const POINTS_LAYER_SELECTED_UNIT_ID = "map-points-circles-selected-unit"
const POINTS_LAYER_911_ID = "map-points-circles-911"
const POINTS_LAYER_SELECTED_911_ID = "map-points-circles-selected-911"
const POINTS_LAYER_RECOMMENDED_ID = "map-points-circles-recommended"
const POINTS_911_BEACONS_SOURCE_ID = "map-points-911-beacons"
const POINTS_911_BEACON_LAYER_ID = "map-points-911-beacon-extrusion"
const POINTS_CRIME_BEACONS_SOURCE_ID = "map-points-crime-beacons"
const POINTS_CRIME_BEACON_LAYER_ID = "map-points-crime-beacon-extrusion"

const POINTS_LABELS_SOURCE_ID = "map-points-labels"
const POINTS_LABELS_LAYER_911_ID = "map-points-labels-911"
const POINTS_LABELS_LAYER_CRIME_ID = "map-points-labels-crime"
const POINTS_LABELS_LAYER_UNITS_ID = "map-points-labels-units"

const POINTS_ELLIPSE_SOURCE_ID = "map-points-ellipses"
const POINTS_ELLIPSE_LAYER_ID = "map-points-ellipses-fill"
const POINTS_ELLIPSE_LAYER_UNIT_ID = "map-points-ellipses-fill-unit"
const POINTS_ELLIPSE_LAYER_SELECTED_ID = "map-points-ellipses-fill-selected"
const POINTS_ELLIPSE_LAYER_SELECTED_UNIT_ID = "map-points-ellipses-fill-selected-unit"
const POINTS_ELLIPSE_LAYER_911_ID = "map-points-ellipses-fill-911"
const POINTS_ELLIPSE_LAYER_SELECTED_911_ID = "map-points-ellipses-fill-selected-911"
const PITCH_ELLIPSE_THRESHOLD_DEG = 5
/** Hysteresis: use ellipses above this pitch, use circles below PITCH_USE_CIRCLE_DEG. Avoids flicker at threshold. */
const PITCH_USE_ELLIPSE_DEG = 8
const PITCH_USE_CIRCLE_DEG = 3

const FILTER_UNIT: maplibregl.FilterSpecification = [
  "any",
  ["==", ["get", "type"], "police"],
  ["==", ["get", "type"], "fire"],
  ["==", ["get", "type"], "ambulance"],
]
const FILTER_CRIME: maplibregl.FilterSpecification = ["==", ["get", "type"], "crime"]
const FILTER_911: maplibregl.FilterSpecification = ["==", ["get", "type"], "911"]

export interface SFMapProps {
  points: MapPoint[]
  selectedPointId?: string | null
  onSelectPoint?: (pointId: string | null) => void
  defaultCenter?: [number, number]
  defaultZoom?: number
  className?: string
  /** When set, map flies to this point then onFlyToComplete is called. */
  flyToTarget?: { lat: number; lng: number } | null
  onFlyToComplete?: () => void
}

export function SFMap({
  points,
  selectedPointId = null,
  onSelectPoint,
  defaultCenter = SF_DEFAULT_CENTER,
  defaultZoom = SF_DEFAULT_ZOOM,
  className,
  flyToTarget = null,
  onFlyToComplete,
}: SFMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const pointsRef = useRef<MapPoint[]>(points)
  const selectedPointIdRef = useRef<string | null>(selectedPointId)
  const pitchRef = useRef<number>(0)
  const useEllipseModeRef = useRef<boolean>(false)
  const lastFlyToRef = useRef<{ lat: number; lng: number } | null>(null)
  const onFlyToCompleteRef = useRef(onFlyToComplete)
  onFlyToCompleteRef.current = onFlyToComplete
  const [pointsLayerReady, setPointsLayerReady] = useState(false)
  const [pointsVersion, setPointsVersion] = useState(0)
  if (pointsRef.current !== points) {
    setPointsVersion((v) => v + 1)
  }
  pointsRef.current = points
  selectedPointIdRef.current = selectedPointId

  // Mount map
  useEffect(() => {
    ensurePmtilesProtocol()
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getSFMapStyle(),
      center: defaultCenter,
      zoom: defaultZoom,
      maxBounds: SF_BOUNDS,
      dragPan: true,
      scrollZoom: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
    })

    map.addControl(new maplibregl.NavigationControl(), "top-right")
    mapRef.current = map

    map.on("load", () => map.resize())

    return () => {
      setPointsLayerReady(false)
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [defaultCenter, defaultZoom])

  // Fly to target when flyToTarget is set. Use manual RAF animation so pan/zoom is always smooth (MapLibre easeTo can snap in some envs).
  useEffect(() => {
    if (!flyToTarget) return
    const map = mapRef.current
    if (!map) return
    const prev = lastFlyToRef.current
    if (prev && prev.lat === flyToTarget.lat && prev.lng === flyToTarget.lng) return
    lastFlyToRef.current = flyToTarget
    const targetLat = flyToTarget.lat
    const targetLng = flyToTarget.lng
    const targetZoom = 14
    const onComplete = () => {
      lastFlyToRef.current = null
      onFlyToCompleteRef.current?.()
    }
    const durationMs = 2000
    let startTime: number | null = null
    let startLng: number | null = null
    let startLat: number | null = null
    let startZoom: number | null = null
    let rafId = 0
    const animate = (timestamp: number) => {
      const m = mapRef.current
      if (!m) return
      if (startTime === null) {
        startTime = timestamp
        const c = m.getCenter()
        startLng = c.lng
        startLat = c.lat
        startZoom = m.getZoom()
      }
      const elapsed = timestamp - startTime
      const t = Math.min(elapsed / durationMs, 1)
      const newLng = (startLng as number) + (targetLng - (startLng as number)) * t
      const newLat = (startLat as number) + (targetLat - (startLat as number)) * t
      const newZoom = (startZoom as number) + (targetZoom - (startZoom as number)) * t
      m.jumpTo({ center: [newLng, newLat], zoom: newZoom })
      if (t < 1) {
        rafId = requestAnimationFrame(animate)
      } else {
        onComplete()
      }
    }
    const timeoutId = window.setTimeout(() => {
      rafId = requestAnimationFrame(animate)
    }, 50)
    return () => {
      window.clearTimeout(timeoutId)
      cancelAnimationFrame(rafId)
    }
  }, [flyToTarget, pointsLayerReady])

  // Add points source + layer after style loads (style.load or load so we catch when map is ready)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const addPointsLayer = () => {
      if (map.getSource(POINTS_SOURCE_ID)) return

      // Units (police/fire/ambulance): smaller radii
      const flatRadiusUnit = MAP_POINT_RADIUS_UNIT_BY_ZOOM.flat()
      const flatRadiusUnitSelected = MAP_POINT_RADIUS_UNIT_SELECTED_BY_ZOOM.flat()
      // Crime and 911: same size (CRIME_POINT_RADIUS_BY_ZOOM)
      const flatCrimeRadius = CRIME_POINT_RADIUS_BY_ZOOM.flat()
      const flatCrimeRadiusSelected = MAP_POINT_RADIUS_SELECTED_BY_ZOOM.map(
        ([z, r]) => [z, r * 2]
      ).flat() as number[]
      const withSelection = (pointsRef.current ?? []).map((p) => ({
        ...p,
        selected: p.id === (selectedPointIdRef.current ?? null),
      }))
      map.addSource(POINTS_SOURCE_ID, {
        type: "geojson",
        data: pointsToGeoJSON(withSelection),
      })

      const paintBase = {
        "circle-color": [
          "case",
          ["get", "disabled"],
          "rgba(107, 114, 128, 0.4)",
          [
            "match",
            ["get", "type"],
            "911",
            MAP_POINT_COLORS["911"],
            "police",
            MAP_POINT_COLORS.police,
            "fire",
            MAP_POINT_COLORS.fire,
            "ambulance",
            MAP_POINT_COLORS.ambulance,
            "crime",
            MAP_POINT_COLORS.crime,
            "#9ca3af",
          ],
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "type"], "911"],
          0,
          ["case", ["==", ["get", "type"], "crime"], 0, ["case", ["==", ["get", "status"], true], 0.8, 2.5]],
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "type"], "911"],
          "transparent",
          ["case", ["==", ["get", "type"], "crime"], "transparent", MAP_POINT_OUTLINE_COLOR],
        ],
        "circle-opacity": [
          "case",
          ["get", "disabled"],
          0.4,
          ["all", ["in", ["get", "type"], ["literal", ["police", "fire", "ambulance"]]], ["==", ["get", "status"], true]],
          0.35,
          0.98,
        ],
      }

      type CirclePaint = maplibregl.CircleLayerSpecification["paint"]
      const unselected: maplibregl.FilterSpecification = ["!", ["get", "selected"]]
      const selected: maplibregl.FilterSpecification = ["get", "selected"]
      const filterUnselectedCrime = ["all", unselected, FILTER_CRIME] as maplibregl.FilterSpecification
      const filterUnselectedUnit = ["all", unselected, FILTER_UNIT] as maplibregl.FilterSpecification
      const filterSelectedCrime = ["all", selected, FILTER_CRIME] as maplibregl.FilterSpecification
      const filterSelectedUnit = ["all", selected, FILTER_UNIT] as maplibregl.FilterSpecification
      const filterUnselected911 = ["all", unselected, FILTER_911] as maplibregl.FilterSpecification
      const filterSelected911 = ["all", selected, FILTER_911] as maplibregl.FilterSpecification

      // Crime (unselected)
      map.addLayer({
        id: POINTS_LAYER_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterUnselectedCrime,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatCrimeRadius],
        } as CirclePaint,
      })

      // Unselected police/fire/ambulance (slightly smaller)
      map.addLayer({
        id: POINTS_LAYER_UNIT_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterUnselectedUnit,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatRadiusUnit],
        } as CirclePaint,
      })

      // Selected crime
      map.addLayer({
        id: POINTS_LAYER_SELECTED_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterSelectedCrime,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatCrimeRadiusSelected],
        } as CirclePaint,
      })

      // Selected police/fire/ambulance (slightly smaller)
      map.addLayer({
        id: POINTS_LAYER_SELECTED_UNIT_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterSelectedUnit,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatRadiusUnitSelected],
        } as CirclePaint,
      })

      // 911 unselected (on top) — same size as crime
      map.addLayer({
        id: POINTS_LAYER_911_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterUnselected911,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatCrimeRadius],
        } as CirclePaint,
      })

      // 911 selected (on top) — same size as crime
      map.addLayer({
        id: POINTS_LAYER_SELECTED_911_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterSelected911,
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatCrimeRadiusSelected],
        } as CirclePaint,
      })

      // Recommended (closest available) units: highlight ring on top of units
      const flatRecommendedRadius = MAP_POINT_RECOMMENDED_RING_RADIUS_BY_ZOOM.flat()
      const filterRecommendedUnit = [
        "all",
        FILTER_UNIT,
        ["get", "recommended"],
      ] as maplibregl.FilterSpecification
      map.addLayer({
        id: POINTS_LAYER_RECOMMENDED_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: filterRecommendedUnit,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatRecommendedRadius],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": MAP_POINT_RECOMMENDED_STROKE_COLOR,
          "circle-opacity": 1,
        } as CirclePaint,
      })

      // Ellipse (oval) layers for 3D perspective — shown when pitch > threshold
      const pitch = map.getPitch()
      map.addSource(POINTS_ELLIPSE_SOURCE_ID, {
        type: "geojson",
        data: pointsToEllipseGeoJSON(withSelection, map.getZoom(), pitch, selectedPointIdRef.current ?? null),
      })
      const ellipsePaintBase = {
        "fill-color": paintBase["circle-color"],
        "fill-opacity": paintBase["circle-opacity"],
        "fill-outline-color": paintBase["circle-stroke-color"],
      } as maplibregl.FillLayerSpecification["paint"]
      const ellipseVisibility = pitch > PITCH_ELLIPSE_THRESHOLD_DEG ? "visible" : "none"
      const circleVisibility = pitch > PITCH_ELLIPSE_THRESHOLD_DEG ? "none" : "visible"

      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterUnselectedCrime,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })
      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_UNIT_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterUnselectedUnit,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })
      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_SELECTED_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterSelectedCrime,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })
      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_SELECTED_UNIT_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterSelectedUnit,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })
      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_911_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterUnselected911,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })
      map.addLayer({
        id: POINTS_ELLIPSE_LAYER_SELECTED_911_ID,
        type: "fill",
        source: POINTS_ELLIPSE_SOURCE_ID,
        filter: filterSelected911,
        paint: ellipsePaintBase,
        layout: { visibility: ellipseVisibility },
      })

      // Keep circles visible when flat, hidden when pitched. Recommended (closest-available) ring stays visible in 3D.
      map.setLayoutProperty(POINTS_LAYER_ID, "visibility", circleVisibility)
      map.setLayoutProperty(POINTS_LAYER_UNIT_ID, "visibility", circleVisibility)
      map.setLayoutProperty(POINTS_LAYER_SELECTED_ID, "visibility", circleVisibility)
      map.setLayoutProperty(POINTS_LAYER_SELECTED_UNIT_ID, "visibility", circleVisibility)
      map.setLayoutProperty(POINTS_LAYER_911_ID, "visibility", circleVisibility)
      map.setLayoutProperty(POINTS_LAYER_SELECTED_911_ID, "visibility", circleVisibility)
      if (map.getLayer(POINTS_LAYER_RECOMMENDED_ID)) {
        map.setLayoutProperty(POINTS_LAYER_RECOMMENDED_ID, "visibility", pitch > PITCH_ELLIPSE_THRESHOLD_DEG ? "visible" : circleVisibility)
      }

      setPointsLayerReady(true)

      const zoom = map.getZoom()
      const r = radiusAtZoom(CRIME_POINT_RADIUS_BY_ZOOM, zoom)

      // 911 vertical beacon (fill-extrusion, cylindrical pillar in 3D); skip if unsupported
      try {
        map.addSource(POINTS_911_BEACONS_SOURCE_ID, {
          type: "geojson",
          data: points911ToBeaconGeoJSON(pointsRef.current ?? [], zoom, r),
        })
        map.addLayer({
          id: POINTS_911_BEACON_LAYER_ID,
          type: "fill-extrusion",
          source: POINTS_911_BEACONS_SOURCE_ID,
          paint: {
            "fill-extrusion-base": 0,
            "fill-extrusion-height": MAP_POINT_911_BEACON_HEIGHT_M,
            "fill-extrusion-color": MAP_POINT_911_BEACON_COLOR,
            "fill-extrusion-opacity": 0.85,
          },
        })
      } catch {
        // fill-extrusion may be unsupported in some environments; circles still work
      }

      // Crime vertical beacons (cylindrical pillars, height 500m); skip if unsupported
      try {
        map.addSource(POINTS_CRIME_BEACONS_SOURCE_ID, {
          type: "geojson",
          data: pointsCrimeToBeaconGeoJSON(pointsRef.current ?? [], zoom, r),
        })
        map.addLayer({
          id: POINTS_CRIME_BEACON_LAYER_ID,
          type: "fill-extrusion",
          source: POINTS_CRIME_BEACONS_SOURCE_ID,
          paint: {
            "fill-extrusion-base": 0,
            "fill-extrusion-height": MAP_POINT_CRIME_BEACON_HEIGHT_M,
            "fill-extrusion-color": MAP_POINT_CRIME_BEACON_COLOR,
            "fill-extrusion-opacity": 0.85,
          },
        })
      } catch {
        // fill-extrusion may be unsupported
      }

      // Inline labels: appear when zoomed in; 911/crime at lower zoom than units
      map.addSource(POINTS_LABELS_SOURCE_ID, {
        type: "geojson",
        data: pointsToLabelsGeoJSON(pointsRef.current ?? []),
        promoteId: "id",
      })
      const labelLayerBase = {
        type: "symbol" as const,
        source: POINTS_LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "text"],
          "text-anchor": "left",
          "text-offset": [0.8, 0],
          "text-size": 10,
          "text-font": ["Roboto Regular"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#E5E7EB",
          "text-halo-color": "#0B0C0E",
          "text-halo-width": 2,
        },
      }
      map.addLayer({
        ...labelLayerBase,
        id: POINTS_LABELS_LAYER_911_ID,
        filter: FILTER_911,
        minzoom: MAP_LABEL_ZOOM_911,
      } as maplibregl.SymbolLayerSpecification)
      map.addLayer({
        ...labelLayerBase,
        id: POINTS_LABELS_LAYER_CRIME_ID,
        filter: FILTER_CRIME,
        minzoom: MAP_LABEL_ZOOM_CRIME,
      } as maplibregl.SymbolLayerSpecification)
      map.addLayer({
        ...labelLayerBase,
        id: POINTS_LABELS_LAYER_UNITS_ID,
        filter: FILTER_UNIT,
        minzoom: MAP_LABEL_ZOOM_UNITS,
      } as maplibregl.SymbolLayerSpecification)
    }

    if (map.isStyleLoaded()) addPointsLayer()
    else map.on("style.load", addPointsLayer)
    map.on("load", addPointsLayer)

    return () => {
      map.off("style.load", addPointsLayer)
      map.off("load", addPointsLayer)
    }
  }, [])

  // Sync points and selected state to GeoJSON source; sync 911 and crime beacon polygons.
  // Dependencies are fixed-length (pointsVersion, selectedPointId) to satisfy React's constant dependency array size.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(POINTS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (!source) return

    const pts = pointsRef.current
    const selId = selectedPointIdRef.current
    const withSelection = pts.map((p) => ({
      ...p,
      selected: p.id === selId,
    }))
    source.setData(pointsToGeoJSON(withSelection))

    const zoom = map.getZoom()
    const r = radiusAtZoom(CRIME_POINT_RADIUS_BY_ZOOM, zoom)

    const beaconSource = map.getSource(POINTS_911_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (beaconSource) beaconSource.setData(points911ToBeaconGeoJSON(pts, zoom, r))
    const crimeBeaconSource = map.getSource(POINTS_CRIME_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (crimeBeaconSource) crimeBeaconSource.setData(pointsCrimeToBeaconGeoJSON(pts, zoom, r))

    if (pitchRef.current > PITCH_ELLIPSE_THRESHOLD_DEG) {
      const ellipseSource = map.getSource(POINTS_ELLIPSE_SOURCE_ID) as maplibregl.GeoJSONSource
      if (ellipseSource) ellipseSource.setData(pointsToEllipseGeoJSON(pts, zoom, pitchRef.current, selId))
    }
    const labelsSource = map.getSource(POINTS_LABELS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (labelsSource) labelsSource.setData(pointsToLabelsGeoJSON(points))
  }, [pointsVersion, selectedPointId])

  // Refresh beacon footprint when zoom or center changes so it matches circle radius
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pointsLayerReady) return

    const refreshBeaconSize = () => {
      const beaconSource = map.getSource(POINTS_911_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
      const crimeBeaconSource = map.getSource(POINTS_CRIME_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
      if (!beaconSource && !crimeBeaconSource) return

      const zoom = map.getZoom()
      const r = radiusAtZoom(CRIME_POINT_RADIUS_BY_ZOOM, zoom)
      const pts = pointsRef.current ?? []

      if (beaconSource) beaconSource.setData(points911ToBeaconGeoJSON(pts, zoom, r))
      if (crimeBeaconSource) crimeBeaconSource.setData(pointsCrimeToBeaconGeoJSON(pts, zoom, r))
    }

    map.on("zoomend", refreshBeaconSize)
    map.on("moveend", refreshBeaconSize)
    return () => {
      map.off("zoomend", refreshBeaconSize)
      map.off("moveend", refreshBeaconSize)
    }
  }, [pointsLayerReady])

  // When pitch/zoom changes: update ellipse data and switch circle vs ellipse visibility (3D = ovals).
  // Hysteresis prevents flicker when pitch hovers near the threshold; ellipse setData only on moveend/pitchend to keep unavailable styling stable during drag.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pointsLayerReady) return

    const applyVisibility = (useEllipses: boolean) => {
      const ellipseVis = useEllipses ? "visible" : "none"
      const circleVis = useEllipses ? "none" : "visible"
      for (const id of [
        POINTS_LAYER_ID,
        POINTS_LAYER_UNIT_ID,
        POINTS_LAYER_SELECTED_ID,
        POINTS_LAYER_SELECTED_UNIT_ID,
        POINTS_LAYER_911_ID,
        POINTS_LAYER_SELECTED_911_ID,
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", circleVis)
      }
      if (map.getLayer(POINTS_LAYER_RECOMMENDED_ID)) {
        map.setLayoutProperty(POINTS_LAYER_RECOMMENDED_ID, "visibility", useEllipses ? "visible" : circleVis)
      }
      for (const id of [
        POINTS_ELLIPSE_LAYER_ID,
        POINTS_ELLIPSE_LAYER_UNIT_ID,
        POINTS_ELLIPSE_LAYER_SELECTED_ID,
        POINTS_ELLIPSE_LAYER_SELECTED_UNIT_ID,
        POINTS_ELLIPSE_LAYER_911_ID,
        POINTS_ELLIPSE_LAYER_SELECTED_911_ID,
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", ellipseVis)
      }
    }

    const updateVisibilityOnly = () => {
      const pitch = map.getPitch()
      pitchRef.current = pitch
      if (pitch > PITCH_USE_ELLIPSE_DEG) useEllipseModeRef.current = true
      else if (pitch < PITCH_USE_CIRCLE_DEG) useEllipseModeRef.current = false
      applyVisibility(useEllipseModeRef.current)
    }

    const updatePitchAndEllipses = () => {
      const pitch = map.getPitch()
      pitchRef.current = pitch
      const zoom = map.getZoom()
      const pts = pointsRef.current ?? []
      const sel = selectedPointIdRef.current ?? null
      const ellipseSource = map.getSource(POINTS_ELLIPSE_SOURCE_ID) as maplibregl.GeoJSONSource
      if (ellipseSource) ellipseSource.setData(pointsToEllipseGeoJSON(pts, zoom, pitch, sel))
      if (pitch > PITCH_USE_ELLIPSE_DEG) useEllipseModeRef.current = true
      else if (pitch < PITCH_USE_CIRCLE_DEG) useEllipseModeRef.current = false
      applyVisibility(useEllipseModeRef.current)
    }

    map.on("move", updateVisibilityOnly)
    map.on("moveend", updatePitchAndEllipses)
    map.on("pitchend", updatePitchAndEllipses)
    updatePitchAndEllipses()
    return () => {
      map.off("move", updateVisibilityOnly)
      map.off("moveend", updatePitchAndEllipses)
      map.off("pitchend", updatePitchAndEllipses)
    }
  }, [pointsLayerReady])

  const showPopup = useCallback(
    (point: MapPoint, lngLat: [number, number]) => {
      const map = mapRef.current
      if (!map) return

      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }

      const is911 = point.type === "911"
      const isCrime = point.type === "crime"
      const title = is911
        ? "911 Call"
        : point.type === "police"
          ? "Police Unit"
          : point.type === "fire"
            ? "Fire Unit"
            : point.type === "ambulance"
              ? "Ambulance"
              : isCrime
                ? "Crime"
                : "Marker"

      const fields: { label: string; value?: string }[] = is911
        ? [
            { label: "Location", value: point.location ?? "Unknown" },
            { label: "Description", value: point.description ?? "Unknown" },
            { label: "Caller ID", value: point.callerId ?? "—" },
            { label: "Caller name", value: point.callerName ?? "Unknown" },
            { label: "Time received", value: point.timestamp ?? "—" },
          ]
        : isCrime
          ? [
              { label: "Category", value: point.location },
              { label: "Address", value: point.description },
              { label: "Details", value: point.callerId },
            ]
          : [
              { label: "Location", value: point.location },
              { label: "Officer in charge", value: point.officerInCharge },
              { label: "Unit ID", value: point.unitId },
              {
                label: "Status",
                value:
                  typeof point.status === "string"
                    ? point.status
                    : point.status === 1 || point.status === true
                      ? "En route"
                      : point.status === 0 || point.status === false
                        ? "Idle"
                        : "Unknown",
              },
            ]

      const content = document.createElement("div")
      content.className = "min-w-[200px]"
      content.innerHTML = `
        <div class="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/50">
            <span class="text-sm font-semibold text-foreground">${title}</span>
          </div>
          <div class="p-3 space-y-1.5 text-sm">
            ${fields
              .filter((f) => f.value != null && f.value !== "")
              .map(
                (f) =>
                  `<div><span class="text-muted-foreground">${f.label}:</span> <span class="text-foreground">${escapeHtml(f.value!)}</span></div>`
              )
              .join("")}
          </div>
        </div>
      `

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: "sf-map-popup",
      })
        .setLngLat(lngLat)
        .setDOMContent(content)
        .addTo(map)

      popup.on("close", () => {
        onSelectPoint?.(null)
      })

      popupRef.current = popup
    },
    [onSelectPoint]
  )

  // Map click: query point, call onSelectPoint, show popup (only after points layer exists)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !onSelectPoint || !pointsLayerReady) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(POINTS_LAYER_ID)) return
      const features = map.queryRenderedFeatures(e.point, {
        layers: [
          POINTS_LAYER_ID,
          POINTS_LAYER_UNIT_ID,
          POINTS_LAYER_SELECTED_ID,
          POINTS_LAYER_SELECTED_UNIT_ID,
          POINTS_LAYER_911_ID,
          POINTS_LAYER_SELECTED_911_ID,
          POINTS_ELLIPSE_LAYER_ID,
          POINTS_ELLIPSE_LAYER_UNIT_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_UNIT_ID,
          POINTS_ELLIPSE_LAYER_911_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_911_ID,
        ],
      })
      if (features.length === 0) return
      const feature = features[0]
      const id = feature.properties?.id as string | undefined
      if (!id) return

      onSelectPoint(id)

      const pts = pointsRef.current
      const point = pts.find((p) => p.id === id)
      if (point) showPopup(point, [point.lng, point.lat])
    }

    map.on("click", handleClick)
    return () => {
      map.off("click", handleClick)
    }
  }, [pointsLayerReady, pointsVersion, onSelectPoint, showPopup])

  // Cursor on hover (only after points layer exists)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pointsLayerReady) return

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(POINTS_LAYER_ID)) return
      const features = map.queryRenderedFeatures(e.point, {
        layers: [
          POINTS_LAYER_ID,
          POINTS_LAYER_UNIT_ID,
          POINTS_LAYER_SELECTED_ID,
          POINTS_LAYER_SELECTED_UNIT_ID,
          POINTS_LAYER_911_ID,
          POINTS_LAYER_SELECTED_911_ID,
          POINTS_ELLIPSE_LAYER_ID,
          POINTS_ELLIPSE_LAYER_UNIT_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_UNIT_ID,
          POINTS_ELLIPSE_LAYER_911_ID,
          POINTS_ELLIPSE_LAYER_SELECTED_911_ID,
        ],
      })
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : ""
    }

    map.on("mousemove", handleMouseMove)
    return () => {
      map.off("mousemove", handleMouseMove)
    }
  }, [pointsLayerReady])

  return <div ref={containerRef} className={className ?? "w-full h-full"} />
}

function escapeHtml(s: string): string {
  const div = document.createElement("div")
  div.textContent = s
  return div.innerHTML
}
