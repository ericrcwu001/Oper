import { Router } from 'express';
import { getPositions } from '../services/vehicleSimulation.js';

const router = Router();

/**
 * GET /api/vehicles
 *
 * Returns current simulated vehicle positions (fire, police, ambulance).
 * Format matches MapPoint: { id, type, lat, lng, unitId?, officerInCharge?, status? }.
 * status: boolean — true = en route, false = idle. Simulation runs in-process.
 * Frontend can poll every 1s.
 */
router.get('/', (req, res) => {
  res.json(getPositions());
});

export default router;
