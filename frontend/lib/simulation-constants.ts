/** Sim seconds per map tick. Higher = crimes appear more quickly. ~30fps × 4 ≈ 120 sim sec per real sec. */
export const SIM_SECONDS_PER_TICK = 4

/** Display multiplier for crime sim clock (e.g. "Day: 3 (120×)"). */
export const CRIME_SIM_CLOCK_SPEEDUP = 120

/** Max distance (approx degrees) for a vehicle to be “drawn” toward a crime (~0.006 deg ≈ 600 m in SF). */
export const CRIME_ATTRACTION_RADIUS_DEG = 0.006

/** Per-frame nudge factor: vehicle position moves this fraction of the way toward nearest crime. */
export const CRIME_ATTRACTION_NUDGE = 0.025

/** Radius (deg) for “at scene” — crime resolves when enough vehicles stay within this for long enough. */
export const CRIME_RESOLVE_RADIUS_DEG = 0.001

/** Min emergency vehicles (police/fire/ambulance) within radius to count toward resolve. */
export const MIN_VEHICLES_AT_SCENE = 1

/** Sim seconds vehicles must stay at scene for the crime to resolve. Longer = harder to clear. */
export const SIM_SECONDS_AT_SCENE_TO_RESOLVE = 18
