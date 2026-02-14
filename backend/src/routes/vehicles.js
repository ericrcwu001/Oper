import { Router } from 'express';
import { getPositions } from '../services/vehicleSimulation.js';

const router = Router();

/**
 * GET /api/vehicles
 *
 * Returns current simulated vehicle positions (fire, police, ambulance).
 * Format matches MapPoint: { id, type, lat, lng, unitId?, status? }.
 * Simulation runs in-process with the server. Frontend can poll every 1s.
 */
router.get('/', (req, res) => {
  res.json(getPositions());
});

export default router;
