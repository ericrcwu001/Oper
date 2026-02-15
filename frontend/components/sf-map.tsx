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
  MAP_POINT_911_BEACON_FOOTPRINT,
  MAP_POINT_CRIME_BEACON_HEIGHT_M,
  MAP_POINT_CRIME_BEACON_COLOR,
  MAP_POINT_CRIME_BEACON_FOOTPRINT,
  MAP_POINT_911_STROKE_COLOR,
  CRIME_POINT_STROKE_COLOR,
  MAP_POINT_RECOMMENDED_STROKE_COLOR,
  MAP_POINT_RECOMMENDED_RING_RADIUS_BY_ZOOM,
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
      },
    })),
  }
}

/** Small square polygon around a point for fill-extrusion beacon (vertical pillar in 3D). */
function points911ToBeaconGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection {
  const h = MAP_POINT_911_BEACON_FOOTPRINT
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = points
    .filter((p) => p.type === "911")
    .map((p) => {
      const [lng, lat] = [p.lng, p.lat]
      const ring: [number, number][] = [
        [lng - h, lat - h],
        [lng + h, lat - h],
        [lng + h, lat + h],
        [lng - h, lat + h],
        [lng - h, lat - h],
      ]
      return {
        type: "Feature",
        id: p.id,
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { id: p.id },
      }
    })
  return { type: "FeatureCollection", features }
}

/** Small square polygon for crime fill-extrusion beacon (smaller than 911). */
function pointsCrimeToBeaconGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection {
  const h = MAP_POINT_CRIME_BEACON_FOOTPRINT
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = points
    .filter((p) => p.type === "crime")
    .map((p) => {
      const [lng, lat] = [p.lng, p.lat]
      const ring: [number, number][] = [
        [lng - h, lat - h],
        [lng + h, lat - h],
        [lng + h, lat + h],
        [lng - h, lat + h],
        [lng - h, lat - h],
      ]
      return {
        type: "Feature",
        id: p.id,
        geometry: { type: "Polygon", coordinates: [ring] },
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
}

export function SFMap({
  points,
  selectedPointId = null,
  onSelectPoint,
  defaultCenter = SF_DEFAULT_CENTER,
  defaultZoom = SF_DEFAULT_ZOOM,
  className,
}: SFMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const pointsRef = useRef<MapPoint[]>(points)
  const selectedPointIdRef = useRef<string | null>(selectedPointId)
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
          3,
          ["case", ["==", ["get", "type"], "crime"], 2.5, 1.8],
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "type"], "911"],
          MAP_POINT_911_STROKE_COLOR,
          ["case", ["==", ["get", "type"], "crime"], CRIME_POINT_STROKE_COLOR, MAP_POINT_OUTLINE_COLOR],
        ],
        "circle-opacity": ["case", ["get", "disabled"], 0.4, 0.98],
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

      setPointsLayerReady(true)

      // 911 vertical beacon (fill-extrusion, visible in 3D/tilted view); skip if unsupported
      try {
        map.addSource(POINTS_911_BEACONS_SOURCE_ID, {
          type: "geojson",
          data: points911ToBeaconGeoJSON(pointsRef.current ?? []),
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

      // Crime vertical beacons (smaller, height 500m); skip if unsupported
      try {
        map.addSource(POINTS_CRIME_BEACONS_SOURCE_ID, {
          type: "geojson",
          data: pointsCrimeToBeaconGeoJSON(pointsRef.current ?? []),
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

    const beaconSource = map.getSource(POINTS_911_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (beaconSource) beaconSource.setData(points911ToBeaconGeoJSON(pts))
    const crimeBeaconSource = map.getSource(POINTS_CRIME_BEACONS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (crimeBeaconSource) crimeBeaconSource.setData(pointsCrimeToBeaconGeoJSON(pts))
  }, [pointsVersion, selectedPointId])

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
        layers: [POINTS_LAYER_ID, POINTS_LAYER_UNIT_ID, POINTS_LAYER_SELECTED_ID, POINTS_LAYER_SELECTED_UNIT_ID, POINTS_LAYER_911_ID, POINTS_LAYER_SELECTED_911_ID],
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
        layers: [POINTS_LAYER_ID, POINTS_LAYER_UNIT_ID, POINTS_LAYER_SELECTED_ID, POINTS_LAYER_SELECTED_UNIT_ID, POINTS_LAYER_911_ID, POINTS_LAYER_SELECTED_911_ID],
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
