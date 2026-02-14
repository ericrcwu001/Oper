import { Router } from 'express';
import { getPositions, setActiveCrimes } from '../services/vehicleSimulation.js';

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

/**
 * POST /api/vehicles/crimes
 * Body: { crimes: [{ lat, lng }, ...] }
 * Sets active crime locations so vehicles within range steer toward them (real movement along roads).
 */
router.post('/crimes', (req, res) => {
  const crimes = req.body?.crimes;
  setActiveCrimes(crimes);
  res.json({ ok: true });
});

export default router;
