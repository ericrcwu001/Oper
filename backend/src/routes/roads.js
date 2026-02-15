import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ROADS_PATH = path.join(DATA_DIR, 'sf-roads.json');
const GRAPH_PATH = path.join(DATA_DIR, 'sf-roads-graph.json');

const router = Router();

/** Convert [lat, lng] coords to GeoJSON [lng, lat]. sf-roads stores lat-first. */
function toGeoJSONCoords(fc) {
  const features = (fc.features || []).map((f) => {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords)) return f;
    const swapped = coords.map((c) => [c[1], c[0]]); // [lat,lng] -> [lng,lat]
    return { ...f, geometry: { ...f.geometry, coordinates: swapped } };
  });
  return { type: 'FeatureCollection', features };
}

/**
 * GET /api/roads
 * Returns sf-roads.json (GeoJSON FeatureCollection). Converts [lat,lng] to [lng,lat].
 */
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(ROADS_PATH)) {
      return res.status(404).json({ error: 'sf-roads.json not found. Run: npm run fetch-sf-roads && npm run build-roads-graph' });
    }
    const data = JSON.parse(fs.readFileSync(ROADS_PATH, 'utf8'));
    res.json(toGeoJSONCoords(data));
  } catch (err) {
    console.error('GET /api/roads error:', err);
    res.status(500).json({ error: 'Failed to load roads data', details: err.message });
  }
});

/**
 * GET /api/roads/graph
 * Returns sf-roads-graph.json edges as GeoJSON FeatureCollection. Converts [lat,lng] to [lng,lat].
 */
router.get('/graph', (req, res) => {
  try {
    if (!fs.existsSync(GRAPH_PATH)) {
      return res.status(404).json({ error: 'sf-roads-graph.json not found. Run: npm run fetch-sf-roads && npm run build-roads-graph' });
    }
    const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
    const edges = graph.edges || [];
    const features = edges.map((e) => ({
      type: 'Feature',
      properties: { highway: 'unclassified' },
      geometry: {
        type: 'LineString',
        coordinates: (e.coords || []).map((c) => [c[1], c[0]]), // [lat,lng] -> [lng,lat]
      },
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error('GET /api/roads/graph error:', err);
    res.status(500).json({ error: 'Failed to load roads graph', details: err.message });
  }
});

export default router;
