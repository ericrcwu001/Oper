import { Router } from 'express';
import { assessTranscriptWithLLM } from '../services/liveEvalService.js';
import { classifyTranscript, getNoteSuggestion } from '../services/openaiService.js';
import { getPositions } from '../services/vehicleSimulation.js';
import { rankByProximityAndETA, getClosestVehiclesForNeededTypes, unitTypeToSimType } from '../services/proximityRanking.js';

const router = Router();

/** Default incident location (e.g. SF) when not provided in the request. */
const DEFAULT_INCIDENT = { lat: 37.7749, lng: -122.4194 };

/**
 * GET /api/call-evaluation/closest?lat=...&lng=...&neededTypes=ambulance,police,fire
 * Returns { closestVehicleIds, closestVehicleByType }. If neededTypes is provided (comma-separated
 * sim types, e.g. ambulance,ambulance,police), only the closest vehicles matching those types are returned.
 */
router.get('/closest', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const incidentLatLng =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEFAULT_INCIDENT;

    const vehicles = getPositions();
    const neededTypesParam = req.query.neededTypes;
    const neededTypes =
      typeof neededTypesParam === 'string' && neededTypesParam.length > 0
        ? neededTypesParam.split(',').map((s) => s.trim()).filter(Boolean)
        : null;

    let closestVehicleIds;
    let closestVehicleByType;
    if (neededTypes && neededTypes.length > 0) {
      const result = getClosestVehiclesForNeededTypes(incidentLatLng, vehicles, neededTypes);
      closestVehicleIds = result.closestVehicleIds;
      closestVehicleByType = result.closestVehicleByType;
    } else {
      const { byType } = rankByProximityAndETA(incidentLatLng, vehicles);
      closestVehicleIds = [
        ...(byType.ambulance || []),
        ...(byType.police || []),
        ...(byType.fire || []),
      ].map((u) => u.id);
      closestVehicleByType = {
        ambulance: byType.ambulance?.[0]?.id ?? null,
        police: byType.police?.[0]?.id ?? null,
        fire: byType.fire?.[0]?.id ?? null,
      };
    }

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
    // Do NOT pass resourceSummary (derived from incidentLocation)—recommendations must be transcript-only
    const result = await assessTranscriptWithLLM(transcript, {});

    // Highlight closest vehicles that match dispatch recommendations (type and count)
    const neededTypes = (result.units || [])
      .map((u) => unitTypeToSimType(u.unit))
      .filter(Boolean);
    const { closestVehicleIds, closestVehicleByType } =
      neededTypes.length > 0
        ? getClosestVehiclesForNeededTypes(incidentLatLng, vehicles, neededTypes)
        : (() => {
            const { byType } = rankByProximityAndETA(incidentLatLng, vehicles);
            return {
              closestVehicleIds: [
                ...(byType.ambulance || []),
                ...(byType.police || []),
                ...(byType.fire || []),
              ].map((u) => u.id),
              closestVehicleByType: {
                ambulance: byType.ambulance?.[0]?.id ?? null,
                police: byType.police?.[0]?.id ?? null,
                fire: byType.fire?.[0]?.id ?? null,
              },
            };
          })();

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

/**
 * POST /api/call-evaluation/classify-transcript
 * Body: { transcript: string } — caller messages joined.
 * Returns: { label: string } — 2–4 word incident type (ALL CAPS) from transcript ONLY.
 */
router.post('/classify-transcript', async (req, res) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
    const label = await classifyTranscript(transcript);
    res.json({ label });
  } catch (e) {
    const message = e.message || 'Classification failed';
    if (message.includes('OPENAI_API_KEY')) {
      res.status(503).json({ error: 'Classification unavailable: OPENAI_API_KEY not set.' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/call-evaluation/note-suggestion
 * Body: { callerText: string } — latest caller statement.
 * Returns: { suggestion: string } — short note if relevant, else "".
 */
router.post('/note-suggestion', async (req, res) => {
  try {
    const callerText = typeof req.body?.callerText === 'string' ? req.body.callerText : '';
    const suggestion = await getNoteSuggestion(callerText);
    res.json({ suggestion });
  } catch (e) {
    const message = e.message || 'Note suggestion failed';
    if (message.includes('OPENAI_API_KEY')) {
      res.status(503).json({ error: 'Note suggestion unavailable: OPENAI_API_KEY not set.' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
