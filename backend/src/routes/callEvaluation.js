import { Router } from 'express';
import { assessTranscriptWithLLM } from '../services/liveEvalService.js';
import { getPositions } from '../services/vehicleSimulation.js';
import { rankByProximityAndETA } from '../services/proximityRanking.js';

const router = Router();

/** Default incident location (e.g. SF) when not provided in the request. */
const DEFAULT_INCIDENT = { lat: 37.7749, lng: -122.4194 };

/**
 * GET /api/call-evaluation/closest?lat=...&lng=...
 * Returns { closestVehicleIds } only (no LLM). Use for live map highlighting as vehicles move.
 */
router.get('/closest', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const incidentLatLng =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEFAULT_INCIDENT;

    const vehicles = getPositions();
    const { byType } = rankByProximityAndETA(incidentLatLng, vehicles);
    const closestVehicleIds = [
      ...(byType.ambulance || []),
      ...(byType.police || []),
      ...(byType.fire || []),
    ].map((u) => u.id);
    const closestVehicleByType = {
      ambulance: byType.ambulance?.[0]?.id ?? null,
      police: byType.police?.[0]?.id ?? null,
      fire: byType.fire?.[0]?.id ?? null,
    };

    res.json({ closestVehicleIds, closestVehicleByType });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Closest units failed' });
  }
});

/**
 * POST /api/call-evaluation/assess
 * Body: { transcript: string, incidentLocation?: { lat: number, lng: number } }
 * Returns: { units, severity, critical?, suggestedCount?, stage?, latestTrigger?, resourceContextUsed? }
 * Live evaluation uses an LLM with RAG and live resource snapshot (closest available units + ETA).
 */
router.post('/assess', async (req, res) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
    const incidentLocation = req.body?.incidentLocation;
    const incidentLatLng =
      incidentLocation && typeof incidentLocation.lat === 'number' && typeof incidentLocation.lng === 'number'
        ? { lat: incidentLocation.lat, lng: incidentLocation.lng }
        : DEFAULT_INCIDENT;

    const vehicles = getPositions();
    const { summaryForLLM, byType } = rankByProximityAndETA(incidentLatLng, vehicles);
    const closestVehicleIds = [
      ...(byType.ambulance || []),
      ...(byType.police || []),
      ...(byType.fire || []),
    ].map((u) => u.id);
    const closestVehicleByType = {
      ambulance: byType.ambulance?.[0]?.id ?? null,
      police: byType.police?.[0]?.id ?? null,
      fire: byType.fire?.[0]?.id ?? null,
    };

    const result = await assessTranscriptWithLLM(transcript, { resourceSummary: summaryForLLM });
    res.json({ ...result, closestVehicleIds, closestVehicleByType });
  } catch (e) {
    const message = e.message || 'Assessment failed';
    if (message.includes('OPENAI_API_KEY')) {
      res.status(503).json({
        error: 'Live evaluation is unavailable: OPENAI_API_KEY is not set.',
      });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
