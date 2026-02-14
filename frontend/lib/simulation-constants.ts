/**
 * Simulation config: crime map playback speed.
 * Every real second = CRIME_SIM_CLOCK_SPEEDUP sim seconds (e.g. 60 = 60× speed).
 */
export const CRIME_SIM_CLOCK_SPEEDUP =
  typeof process !== "undefined" &&
  process.env?.NEXT_PUBLIC_CRIME_SIM_CLOCK_SPEEDUP != null
    ? Math.max(1, parseInt(process.env.NEXT_PUBLIC_CRIME_SIM_CLOCK_SPEEDUP, 10) || 5)
    : 5
