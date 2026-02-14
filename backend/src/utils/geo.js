/**
 * Geo utilities for road graph and vehicle simulation.
 * - haversineMeters: distance between two [lat, lng] points
 * - pointAtDistanceM: interpolate (lat, lng) along polyline at given distance
 */

/** Earth radius in meters. */
const R = 6371000;

/**
 * Approximate meters between two [lat, lng] points using haversine formula.
 * @param {[number, number]} a - [lat, lng]
 * @param {[number, number]} b - [lat, lng]
 * @returns {number} Distance in meters
 */
export function haversineMeters(a, b) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Get (lat, lng) at a given distance along a polyline.
 * Walks coords, sums haversine distances, interpolates within sub-segment.
 * @param {[number, number][]} coords - Array of [lat, lng]
 * @param {number} segmentLengthM - Total length of the segment in meters
 * @param {number} distanceM - Distance along segment in meters
 * @returns {[number, number]} [lat, lng] at that distance
 */
export function pointAtDistanceM(coords, segmentLengthM, distanceM) {
  if (coords.length < 2) return coords[0] ?? [0, 0];
  if (distanceM <= 0) return coords[0];
  if (distanceM >= segmentLengthM) return coords[coords.length - 1];

  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineMeters(coords[i - 1], coords[i]);
    if (cum + segLen >= distanceM) {
      const t = (distanceM - cum) / segLen;
      const lat = coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]);
      const lng = coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]);
      return [lat, lng];
    }
    cum += segLen;
  }
  return coords[coords.length - 1];
}
