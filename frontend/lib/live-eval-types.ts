/**
 * WebSocket message types for live call evaluation (must match backend message-contracts.js).
 */

export const LIVE_EVAL_MSG = {
  AUDIO_CHUNK: "AUDIO_CHUNK",
  START_SESSION: "START_SESSION",
  END_SESSION: "END_SESSION",
  TRANSCRIPT_DELTA: "TRANSCRIPT_DELTA",
  TRANSCRIPT_FINAL: "TRANSCRIPT_FINAL",
  RECOMMENDATION_UPDATE: "RECOMMENDATION_UPDATE",
  ERROR: "ERROR",
} as const

export type UnitType = "EMT_BLS" | "ALS" | "Police" | "Fire" | "SWAT"
export type Severity = "low" | "medium" | "high" | "critical"

export interface TranscriptDeltaPayload {
  text: string
  isPartial?: boolean
}

export interface TranscriptFinalPayload {
  text: string
}

export interface UnitRecommendation {
  unit: UnitType
  rationale?: string
  severity?: Severity
}

export interface RecommendationUpdatePayload {
  units: UnitRecommendation[]
  rationales?: string[]
  severity?: Severity
}

export type ServerMessage =
  | { type: typeof LIVE_EVAL_MSG.TRANSCRIPT_DELTA; payload: TranscriptDeltaPayload }
  | { type: typeof LIVE_EVAL_MSG.TRANSCRIPT_FINAL; payload: TranscriptFinalPayload }
  | { type: typeof LIVE_EVAL_MSG.RECOMMENDATION_UPDATE; payload: RecommendationUpdatePayload }
  | { type: typeof LIVE_EVAL_MSG.ERROR; payload: { message: string } }
