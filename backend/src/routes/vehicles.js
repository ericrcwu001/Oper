import { Router } from 'express';
import { getPositions, setActiveCrimes, setDispatchTarget } from '../services/vehicleSimulation.js';

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
 * Body: { crimes: [{ lat, lng }, ...], dispatchTarget?: { lat, lng }, dispatchVehicleIds?: string[] }
 * Sets active crime locations so vehicles within range steer toward them.
 * If dispatchTarget and dispatchVehicleIds are provided, those vehicles (purple-highlighted) steer toward the 911 call.
 */
router.post('/crimes', (req, res) => {
  const crimes = req.body?.crimes;
  setActiveCrimes(crimes);
  const dispatchTarget = req.body?.dispatchTarget;
  const dispatchVehicleIds = req.body?.dispatchVehicleIds;
  setDispatchTarget(dispatchTarget ?? null, dispatchVehicleIds ?? []);
  res.json({ ok: true });
});

export default router;
