/**
 * Backend API base URL. Set NEXT_PUBLIC_API_URL in .env for production.
 */
const API_BASE =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:3001"

/** WebSocket URL for live call evaluation (same host/port as API, path /live-eval). */
export function getLiveEvalWsUrl(): string {
  const base = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:3001"
  return base.replace(/^http/, "ws") + "/live-eval"
}

export interface GenerateCallAudioResponse {
  audioUrl: string
  transcript: string
}

export interface InteractResponse {
  audioUrl: string
  transcript: string
  conversationHistory: { role: "caller" | "operator"; content: string }[]
}

import type { ScenarioPayload } from "@/lib/types"

/** Full scenario payload from POST /api/scenarios/generate (backend scenarioGenerator). */
export interface GeneratedScenarioPayload {
  scenario: {
    id: string
    scenario_type: string
    title: string
    description: string
    caller_profile: {
      name: string
      age: number
      emotion: string
      gender?: string
      race?: string
      other_relevant_details?: string
    }
    critical_info: string[]
    expected_actions: string[]
    optional_complications?: string[]
    difficulty: "easy" | "medium" | "hard"
    language: string
  }
  persona?: {
    stability?: number
    style?: number
    speed?: number
    voice_description?: string
  }
  caller_script?: string[]
  role_instruction?: string
  scenario_summary_for_agent?: string
  critical_info?: string[]
  withheld_information?: string[]
  behavior_notes?: string
  dialogue_directions?: string
  response_behavior?: string[]
  opening_line?: string
  do_not_say?: string[]
  /** Map of seconds-into-call (string keys) to event descriptions. */
  timeline?: Record<string, string>
}

/** Scenario sent to generate-call-audio / interact: string (legacy), simple payload, or full generator payload. */
export type CallScenarioInput =
  | string
  | ScenarioPayload
  | GeneratedScenarioPayload

/**
 * Generate a new scenario from the backend (POST /api/scenarios/generate).
 */
export async function generateScenario(
  difficulty: "easy" | "medium" | "hard"
): Promise<GeneratedScenarioPayload> {
  const res = await fetch(`${API_BASE}/api/scenarios/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Failed to generate scenario"
    )
  }
  return res.json() as Promise<GeneratedScenarioPayload>
}

/** Optional context for caller response: current call time and events since last response. */
export interface CallerResponseContext {
  /** Seconds into the call. */
  callTimestampSeconds: number
  /** Event descriptions that occurred since the last caller response (from scenario timeline). */
  eventsSinceLastResponse?: string[]
}

/**
 * Generate initial caller audio (POST /generate-call-audio).
 * Accepts simple ScenarioPayload or full GeneratedScenarioPayload for voice + persona settings.
 */
export async function generateCallAudio(
  scenario: CallScenarioInput,
  context?: CallerResponseContext
): Promise<GenerateCallAudioResponse> {
  const body: Record<string, unknown> = { scenario }
  if (context != null) {
    body.callTimestampSeconds = context.callTimestampSeconds
    if (context.eventsSinceLastResponse?.length)
      body.eventsSinceLastResponse = context.eventsSinceLastResponse
  }
  const res = await fetch(`${API_BASE}/generate-call-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Failed to generate call audio"
    )
  }
  return res.json() as Promise<GenerateCallAudioResponse>
}

/**
 * Send operator message (text) and get next caller audio (POST /interact).
 * Accepts simple ScenarioPayload or full GeneratedScenarioPayload.
 */
export async function interact(
  scenario: CallScenarioInput,
  userInput: string,
  conversationHistory: { role: "caller" | "operator"; content: string }[],
  context?: CallerResponseContext
): Promise<InteractResponse> {
  const body: Record<string, unknown> = {
    scenario,
    userInput,
    conversationHistory,
  }
  if (context != null) {
    body.callTimestampSeconds = context.callTimestampSeconds
    if (context.eventsSinceLastResponse?.length)
      body.eventsSinceLastResponse = context.eventsSinceLastResponse
  }
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Failed to get caller response"
    )
  }
  return res.json() as Promise<InteractResponse>
}

/**
 * Send operator voice (base64 audio) and get next caller audio (POST /interact).
 * Backend uses Whisper to transcribe, then GPT + ElevenLabs for the reply.
 * Accepts simple ScenarioPayload or full GeneratedScenarioPayload.
 */
export async function interactWithVoice(
  scenario: CallScenarioInput,
  userInputAudioBase64: string,
  conversationHistory: { role: "caller" | "operator"; content: string }[],
  context?: CallerResponseContext
): Promise<InteractResponse> {
  const body: Record<string, unknown> = {
    scenario,
    userInputAudio: userInputAudioBase64,
    conversationHistory,
  }
  if (context != null) {
    body.callTimestampSeconds = context.callTimestampSeconds
    if (context.eventsSinceLastResponse?.length)
      body.eventsSinceLastResponse = context.eventsSinceLastResponse
  }
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Failed to get caller response"
    )
  }
  return res.json() as Promise<InteractResponse>
}

export interface Evaluation {
  protocolAdherence: number
  timeliness: number
  criticalInfoCapture: number
  overallScore: number
  missedActions: string[]
  feedbackBullets: string[]
}

/**
 * Evaluate operator performance from transcript and notes (POST /evaluate).
 * scenarioTimeline: optional map of seconds (string keys) to event descriptions for this scenario.
 */
export async function evaluateCall(
  transcript: { speaker: string; text: string; timestamp?: number }[],
  notes: { text: string; tag?: string; timestamp?: number }[],
  scenarioDescription: string,
  scenarioTimeline?: Record<string, string>
): Promise<Evaluation> {
  const body: Record<string, unknown> = {
    transcript,
    notes,
    scenarioDescription,
  }
  if (scenarioTimeline != null && Object.keys(scenarioTimeline).length > 0) {
    body.scenarioTimeline = scenarioTimeline
  }
  const res = await fetch(`${API_BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? "Evaluation failed")
  }
  return res.json() as Promise<Evaluation>
}

/** Response from POST /api/call-evaluation/assess (dispatch recommendations from transcript). */
export interface AssessCallTranscriptResponse {
  units: { unit: string; rationale?: string; severity?: string }[]
  severity: string
  critical?: boolean
}

/**
 * Get dispatch recommendations from caller transcript (used during simulation).
 * POST /api/call-evaluation/assess
 */
export async function assessCallTranscript(
  transcript: string
): Promise<AssessCallTranscriptResponse> {
  const res = await fetch(`${API_BASE}/api/call-evaluation/assess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Assessment failed"
    )
  }
  return res.json() as Promise<AssessCallTranscriptResponse>
}
