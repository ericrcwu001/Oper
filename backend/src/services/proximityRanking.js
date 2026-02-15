/**
 * Haversine-based Geospatial Proximity Ranking with ETA.
 * Filters to available (idle) units, computes great-circle distance, ranks by distance,
 * and estimates time of arrival using type-specific average response speed.
 */

import { haversineMeters } from '../utils/geo.js';

/** Average speed m/s per vehicle type (from vehicle simulation SPEED_BASE). */
const SPEED_AVG = { police: 11, fire: 13, ambulance: 13 };

const TOP_N_PER_TYPE = 3;
const VEHICLE_TYPES = ['ambulance', 'police', 'fire'];

/**
 * @typedef {{ id: string, type: string, lat: number, lng: number, status?: boolean }} Vehicle
 * @typedef {{ id: string, type: string, distanceM: number, etaSec: number }} RankedUnit
 * @typedef {{ byType: Record<string, RankedUnit[]>, summaryForLLM: string }} ProximityResult
 */

/**
 * Run proximity ranking: filter available, compute distance and ETA, return top N per type.
 * @param {{ lat: number, lng: number }} incidentLatLng - Incident (caller) position
 * @param {Vehicle[]} vehicles - List of vehicles (id, type, lat, lng, status). status === false = idle/available
 * @returns {ProximityResult}
 */
export function rankByProximityAndETA(incidentLatLng, vehicles) {
  const incident = [incidentLatLng.lat, incidentLatLng.lng];
  const available = (vehicles || []).filter((v) => v && typeof v.lat === 'number' && typeof v.lng === 'number' && v.status === false);
  const withDistance = available.map((v) => {
    const distanceM = haversineMeters(incident, [v.lat, v.lng]);
    const speed = SPEED_AVG[v.type] || 11;
    const etaSec = distanceM / speed;
    return { id: v.id, type: v.type, distanceM, etaSec };
  });
  withDistance.sort((a, b) => a.distanceM - b.distanceM);

  const byType = { ambulance: [], police: [], fire: [] };
  for (const t of VEHICLE_TYPES) {
    const ofType = withDistance.filter((u) => u.type === t).slice(0, TOP_N_PER_TYPE);
    byType[t] = ofType;
  }

  const summaryForLLM = buildSummaryForLLM(incidentLatLng, byType);
  return { byType, summaryForLLM };
}

/**
 * @param {{ lat: number, lng: number }} incidentLatLng
 * @param {Record<string, RankedUnit[]>} byType
 * @returns {string}
 */
function buildSummaryForLLM(incidentLatLng, byType) {
  const parts = [];
  for (const t of VEHICLE_TYPES) {
    const list = byType[t] || [];
    if (list.length === 0) {
      parts.push(`${t}: none available nearby.`);
      continue;
    }
    const desc = list
      .map((u) => {
        const km = (u.distanceM / 1000).toFixed(2);
        const min = (u.etaSec / 60).toFixed(1);
        return `${u.id} (${km} km, ETA ${min} min)`;
      })
      .join(', ');
    parts.push(`${t}: ${desc}.`);
  }
  return `Incident at ${incidentLatLng.lat.toFixed(4)}, ${incidentLatLng.lng.toFixed(4)}. Closest available units: ${parts.join(' ')}`;
}
