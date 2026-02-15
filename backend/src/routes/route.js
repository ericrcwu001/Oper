import { Router } from 'express';
import { findRoute, findRouteForVehicle } from '../services/roadRoutingService.js';

const router = Router();

/**
 * GET /api/route
 * Query: fromLat, fromLng, toLat, toLng, vehicleType (optional: police | fire | ambulance)
 * Returns A* route on road graph: { coords: [lng,lat][], distanceM, etaSec } or null.
 */
router.get('/', (req, res) => {
  try {
    const fromLat = parseFloat(req.query.fromLat);
    const fromLng = parseFloat(req.query.fromLng);
    const toLat = parseFloat(req.query.toLat);
    const toLng = parseFloat(req.query.toLng);
    const vehicleType = req.query.vehicleType;

    if (
      Number.isNaN(fromLat) ||
      Number.isNaN(fromLng) ||
      Number.isNaN(toLat) ||
      Number.isNaN(toLng)
    ) {
      return res.status(400).json({
        error: 'Missing or invalid query: fromLat, fromLng, toLat, toLng required',
      });
    }

    const from = { lat: fromLat, lng: fromLng };
    const to = { lat: toLat, lng: toLng };

    const result =
      vehicleType && ['police', 'fire', 'ambulance'].includes(vehicleType)
        ? findRouteForVehicle(from, to, vehicleType)
        : findRoute(from, to);

    if (!result) {
      return res.status(404).json({ error: 'No route found', coords: null });
    }

    res.json({ coords: result.coords, distanceM: result.distanceM, etaSec: result.etaSec });
  } catch (err) {
    console.error('GET /api/route error:', err);
    res.status(500).json({ error: 'Route failed', details: err.message });
  }
});

export default router;
