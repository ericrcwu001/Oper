/**
 * Incident state store for live call evaluation.
 * Holds signals and context derived from transcript for the assessment engine.
 */

/**
 * @typedef {'EMT_BLS'|'ALS'|'Police'|'Fire'|'SWAT'} UnitType
 * @typedef {'low'|'medium'|'high'|'critical'} Severity
 * @typedef {{ unit: UnitType, rationale: string, severity: string }} RationaleEntry
 * @typedef {{ fullTranscript: string, signals: string[], recommendedUnits: Set<UnitType>, severity: Severity, rationales: RationaleEntry[] }} IncidentState
 */

const DEFAULT_SEVERITY = 'low';

/**
 * Create a fresh incident state.
 * @returns {IncidentState}
 */
export function createIncidentState() {
  return {
    fullTranscript: '',
    signals: [],
    recommendedUnits: new Set(),
    severity: DEFAULT_SEVERITY,
    rationales: [],
  };
}

/**
 * Append final transcript segment (mutates state).
 * @param {IncidentState} state
 * @param {string} segment
 */
export function appendTranscript(state, segment) {
  const trimmed = (segment || '').trim();
  if (!trimmed) return;
  state.fullTranscript = (state.fullTranscript + ' ' + trimmed).trim();
}

/**
 * Record a detected signal.
 * @param {IncidentState} state
 * @param {string} signalKey
 */
export function addSignal(state, signalKey) {
  if (!state.signals.includes(signalKey)) {
    state.signals.push(signalKey);
  }
}

/**
 * Set recommendations from assessment (replaces previous).
 * @param {IncidentState} state
 * @param {RationaleEntry[]} entries
 * @param {Severity} [overallSeverity]
 */
export function setRecommendations(state, entries, overallSeverity) {
  state.recommendedUnits = new Set(entries.map((e) => e.unit));
  state.rationales = entries;
  if (overallSeverity) state.severity = overallSeverity;
}

/**
 * Get serializable snapshot for RECOMMENDATION_UPDATE payload.
 * @param {IncidentState} state
 * @returns {{ units: RationaleEntry[], severity: string }}
 */
export function getRecommendationSnapshot(state) {
  return {
    units: [...state.rationales],
    severity: state.severity,
  };
}
