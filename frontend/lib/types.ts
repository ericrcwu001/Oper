export type ScenarioType = "cardiac-arrest" | "fire" | "traffic-accident"
export type Difficulty = "easy" | "medium" | "hard"
export type Language = "en" | "es"
export type Speaker = "caller" | "operator"
export type ConnectionStatus = "connected" | "connecting" | "disconnected"

export interface Scenario {
  id: string
  scenarioType: ScenarioType
  title: string
  description: string
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

export interface TranscriptTurn {
  id: string
  timestamp: number
  speaker: Speaker
  text: string
  isPartial?: boolean
}

export interface Evaluation {
  protocolAdherence: number
  timeliness: number
  criticalInfoCapture: number
  overallScore: number
  missedActions: string[]
  feedbackBullets: string[]
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
