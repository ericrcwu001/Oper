/**
 * WebSocket message contracts for live call evaluation.
 * Client ↔ Server message types and payload shapes.
 */

// ─── Message type constants ─────────────────────────────────────────────────

export const MSG = {
  // Client → Server
  AUDIO_CHUNK: 'AUDIO_CHUNK',
  START_SESSION: 'START_SESSION',
  END_SESSION: 'END_SESSION',

  // Server → Client
  TRANSCRIPT_DELTA: 'TRANSCRIPT_DELTA',
  TRANSCRIPT_FINAL: 'TRANSCRIPT_FINAL',
  RECOMMENDATION_UPDATE: 'RECOMMENDATION_UPDATE',
  ERROR: 'ERROR',
};

// ─── Payload shapes (for documentation and validation) ───────────────────────

/**
 * @typedef {Object} TranscriptDeltaPayload
 * @property {string} text - Partial or incremental transcript text
 * @property {boolean} [isPartial] - True if more text may follow (interim result)
 */

/**
 * @typedef {Object} TranscriptFinalPayload
 * @property {string} text - Final transcript segment (committed)
 */

/**
 * @typedef {'EMT_BLS'|'ALS'|'Police'|'Fire'|'SWAT'} UnitType
 */

/**
 * @typedef {Object} UnitRecommendation
 * @property {UnitType} unit
 * @property {string} [rationale]
 * @property {'low'|'medium'|'high'|'critical'} [severity]
 */

/**
 * @typedef {Object} RecommendationUpdatePayload
 * @property {UnitRecommendation[]} units - Recommended dispatch units
 * @property {string[]} [rationales] - Human-readable rationale strings (order matches context)
 * @property {'low'|'medium'|'high'|'critical'} [severity] - Overall incident severity
 */

/**
 * Server → Client: wire format for any message
 * @typedef {Object} ServerMessage
 * @property {string} type - One of MSG.TRANSCRIPT_* or MSG.RECOMMENDATION_UPDATE, MSG.ERROR
 * @property {TranscriptDeltaPayload|TranscriptFinalPayload|RecommendationUpdatePayload|{ message: string }} payload
 */
