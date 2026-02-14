/**
 * Assessment engine: consumes transcript events, maintains IncidentState,
 * applies policy rules, and triggers recommendation updates (debounced or immediate).
 */

import { createIncidentState, appendTranscript, setRecommendations, getRecommendationSnapshot } from './incident-state.js';
import { evaluateRules, deduplicateByUnit } from './policy-rules.js';

const DEBOUNCE_MS = 1000; // Max 1 recommendation update per second
const CRITICAL_BYPASS_DEBOUNCE = true;

/**
 * @param {(payload: import('./message-contracts.js').RecommendationUpdatePayload) => void} onRecommendation
 * @returns {{ processFinalTranscript: (text: string) => void, getState: () => import('./incident-state.js').IncidentState, reset: () => void }}
 */
export function createAssessmentEngine(onRecommendation) {
  const state = createIncidentState();
  let debounceTimer = null;
  let lastEmitted = 0;

  function emitUpdate() {
    const snap = getRecommendationSnapshot(state);
    onRecommendation({
      units: snap.units,
      rationales: snap.units.map((u) => u.rationale),
      severity: snap.severity,
    });
    lastEmitted = Date.now();
  }

  function scheduleDebounced() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      emitUpdate();
    }, DEBOUNCE_MS);
  }

  /**
   * Call when a final transcript segment is available.
   * @param {string} text
   */
  function processFinalTranscript(text) {
    const segment = (text || '').trim();
    if (!segment) return;

    appendTranscript(state, segment);
    const result = evaluateRules(state.fullTranscript);

    if (result.rationales.length === 0) return;

    const deduped = deduplicateByUnit(result.rationales);
    setRecommendations(state, deduped, result.severity);

    if (CRITICAL_BYPASS_DEBOUNCE && result.critical) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      emitUpdate();
      return;
    }

    const now = Date.now();
    if (now - lastEmitted >= DEBOUNCE_MS) {
      emitUpdate();
    } else {
      scheduleDebounced();
    }
  }

  function reset() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    state.fullTranscript = '';
    state.signals.length = 0;
    state.recommendedUnits.clear();
    state.severity = 'low';
    state.rationales = [];
    lastEmitted = 0;
  }

  return {
    processFinalTranscript,
    getState: () => state,
    reset,
  };
}
