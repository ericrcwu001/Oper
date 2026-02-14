#!/usr/bin/env node
/**
 * One-time script: fetch SF road LineStrings from Overpass API, save as GeoJSON.
 * Output: backend/data/sf-roads.json
 *
 * Run: node backend/scripts/fetch-sf-roads.js
 * Or:  npm run fetch-sf-roads
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SF bbox: [minLat, minLon, maxLat, maxLon] (SW to NE)
const SF_BBOX = [37.7, -122.52, 37.83, -122.35];
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const OVERPASS_QUERY = `
[out:json][timeout:120][maxsize:536870912];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${SF_BBOX[0]},${SF_BBOX[1]},${SF_BBOX[2]},${SF_BBOX[3]});
);
out geom;
`;

async function fetchWithRetry(url, body, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function osmToGeoJSON(elements) {
  const features = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((n) => [n.lat, n.lon]);
    features.push({
      type: "Feature",
      properties: { highway: el.tags?.highway || "unclassified" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return {
    type: "FeatureCollection",
    features,
  };
}

async function main() {
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "sf-roads.json");

  console.log("Fetching SF roads from Overpass API (drivable types only)...");
  const data = await fetchWithRetry(OVERPASS_URL, `data=${encodeURIComponent(OVERPASS_QUERY)}`);
  const elements = data.elements || [];
  console.log(`Received ${elements.length} ways`);

  const geojson = osmToGeoJSON(elements);
  fs.writeFileSync(outPath, JSON.stringify(geojson, null, 0), "utf8");
  console.log(`Wrote ${geojson.features.length} LineStrings to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
