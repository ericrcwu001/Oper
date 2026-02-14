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
  MAP_POINT_RADIUS_BY_ZOOM,
  MAP_POINT_RADIUS_SELECTED_BY_ZOOM,
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
      },
    })),
  }
}

const POINTS_SOURCE_ID = "map-points"
const POINTS_LAYER_ID = "map-points-circles"
const POINTS_LAYER_SELECTED_ID = "map-points-circles-selected"

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

  // Add points source + layer after style loads
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const onStyleLoad = () => {
      if (map.getSource(POINTS_SOURCE_ID)) return

      const flatRadius = MAP_POINT_RADIUS_BY_ZOOM.flat()
      const flatRadiusSelected = MAP_POINT_RADIUS_SELECTED_BY_ZOOM.flat()
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
            "#9ca3af",
          ],
        ],
        "circle-stroke-width": 1.8,
        "circle-stroke-color": MAP_POINT_OUTLINE_COLOR,
        "circle-opacity": ["case", ["get", "disabled"], 0.4, 0.98],
      }

      // Unselected: zoom must be top-level in interpolate (MapLibre requirement)
      map.addLayer({
        id: POINTS_LAYER_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: ["!", ["get", "selected"]],
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatRadius],
        },
      })

      // Selected: same, separate layer so radius uses only top-level interpolate
      map.addLayer({
        id: POINTS_LAYER_SELECTED_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: ["get", "selected"],
        paint: {
          ...paintBase,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], ...flatRadiusSelected],
        },
      })
      setPointsLayerReady(true)
    }

    if (map.isStyleLoaded()) onStyleLoad()
    else map.on("style.load", onStyleLoad)

    return () => {
      map.off("style.load", onStyleLoad)
    }
  }, [])

  // Sync points and selected state to GeoJSON source
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(POINTS_SOURCE_ID) as maplibregl.GeoJSONSource
    if (!source) return

    const withSelection = points.map((p) => ({
      ...p,
      selected: p.id === selectedPointId,
    }))
    source.setData(pointsToGeoJSON(withSelection))
  }, [points, selectedPointId])

  const showPopup = useCallback(
    (point: MapPoint, lngLat: [number, number]) => {
      const map = mapRef.current
      if (!map) return

      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }

      const is911 = point.type === "911"
      const title = is911
        ? "911 Call"
        : point.type === "police"
          ? "Police Unit"
          : point.type === "fire"
            ? "Fire Unit"
            : "Ambulance"

      const fields: { label: string; value?: string }[] = is911
        ? [
            { label: "Location", value: point.location },
            { label: "Description", value: point.description },
            { label: "Caller ID", value: point.callerId },
            { label: "Caller name", value: point.callerName },
            { label: "Time received", value: point.timestamp },
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
      const features = map.queryRenderedFeatures(e.point, {
        layers: [POINTS_LAYER_ID, POINTS_LAYER_SELECTED_ID],
      })
      if (features.length === 0) return
      const feature = features[0]
      const id = feature.properties?.id as string | undefined
      if (!id) return

      onSelectPoint(id)

      const point = points.find((p) => p.id === id)
      if (point) showPopup(point, [point.lng, point.lat])
    }

    map.on("click", handleClick)
    return () => {
      map.off("click", handleClick)
    }
  }, [pointsLayerReady, points, onSelectPoint, showPopup])

  // Cursor on hover (only after points layer exists)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pointsLayerReady) return

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [POINTS_LAYER_ID, POINTS_LAYER_SELECTED_ID],
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
