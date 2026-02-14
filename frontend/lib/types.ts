export type ScenarioType = "cardiac-arrest" | "fire" | "traffic-accident"
export type Difficulty = "easy" | "medium" | "hard"
export type Language = "en" | "es"
export type Speaker = "caller" | "operator"
export type ConnectionStatus = "connected" | "connecting" | "disconnected"

export interface Scenario {
  id: string
  scenarioType: ScenarioType
  title: string
  /** Description of the emergency situation (location, what happened, etc.). */
  description: string
  /** Human-readable description of the caller (used for TTS voice matching and AI context). */
  callerDescription: string
  callerProfile: {
    name: string
    age: number
    emotion: string
  }
  criticalInfo: string[]
  expectedActions: string[]
  optionalComplications: string[]
  difficulty: Difficulty
  language: Language
}

/** Payload sent to backend for generate-call-audio and interact (scenario + caller + optional difficulty). */
export interface ScenarioPayload {
  scenarioDescription: string
  callerDescription: string
  /** Selected difficulty (easy/medium/hard); sent so backend can tailor dialogue. */
  difficulty?: Difficulty
}

export interface TranscriptTurn {
  id: string
  timestamp: number
  speaker: Speaker
  text: string
  isPartial?: boolean
}

export type TranscriptHighlightType =
  | "missed_action"
  | "red_flag"
  | "improvement"
  | "good_move"

export interface TranscriptHighlight {
  turnIndex: number
  type: TranscriptHighlightType
  label: string
  detail?: string
}

export interface Evaluation {
  protocolAdherence: number
  timeliness: number
  criticalInfoCapture: number
  overallScore: number
  missedActions: string[]
  feedbackBullets: string[]
  transcriptHighlights?: TranscriptHighlight[]
}

export interface Session {
  id: string
  scenarioId: string
  scenarioType: ScenarioType
  scenarioTitle: string
  difficulty: Difficulty
  language: Language
  startedAt: string
  endedAt: string
  durationSec: number
  transcript: TranscriptTurn[]
  notes: string
  operatorSummary: string
  evaluation: Evaluation
}

export interface NoteEntry {
  id: string
  timestamp: number
  text: string
  tag?: string
}
