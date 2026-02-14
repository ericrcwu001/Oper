import type { StyleSpecification } from "maplibre-gl"
import { PMTILES_URL } from "./map-constants"

/** MapLibre GL style spec (v8). Builds basemap only: background + waterway + roads; no labels/POIs. */
export function getSFMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: "© Protomaps © OpenStreetMap",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0B0C0E" },
      },
      {
        id: "waterway",
        type: "line",
        source: "protomaps",
        "source-layer": "physical_line",
        filter: ["==", "pmap:kind", "waterway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#1B1E22",
          "line-width": 0.5,
          "line-opacity": 0.55,
        },
      },
      {
        id: "roads-all",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#4b5563",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 0.5,
            14, 1.2,
            16, 1.8,
          ],
          "line-opacity": 0.6,
        },
      },
      {
        id: "roads-local",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        filter: ["in", "pmap:kind", "minor_road", "other"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#434a54",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11, 0.3,
            13, 0.6,
            15, 0.9,
            16, 1.05,
          ],
          "line-opacity": 0.48,
        },
      },
      {
        id: "roads-mid",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        filter: ["==", "pmap:kind", "medium_road"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#6b7280",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 0.6,
            12, 1.2,
            14, 1.8,
            16, 2.6,
          ],
          "line-opacity": 0.85,
        },
      },
      {
        id: "roads-highway-casing",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        filter: ["in", "pmap:kind", "major_road", "highway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#0B0C0E",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9, 1.6,
            12, 3,
            14, 5,
            16, 7.2,
          ],
        },
      },
      {
        id: "roads-highway",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        filter: ["in", "pmap:kind", "major_road", "highway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#9ca3af",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9, 1,
            12, 2.2,
            14, 3.8,
            16, 5.6,
          ],
          "line-opacity": 1,
        },
      },
    ],
  } as StyleSpecification
}
