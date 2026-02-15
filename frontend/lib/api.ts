/**
 * Backend API base URL. Set NEXT_PUBLIC_API_URL in .env for production.
 */
const API_BASE =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:3001"

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
import type { MapPoint } from "@/lib/map-types"

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
    /** SF map location for the incident (lat 37.7–37.83, lng -122.52 to -122.35). */
    location?: { address: string; lat: number; lng: number }
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
/**
 * Fetch current simulated vehicle positions (GET /api/vehicles).
 * Returns MapPoint-compatible array; empty if simulation not running or unavailable.
 */
export async function fetchVehicles(): Promise<MapPoint[]> {
  const res = await fetch(`${API_BASE}/api/vehicles`)
  if (!res.ok) return []
  const data = await res.json()
  return (Array.isArray(data) ? data : []) as MapPoint[]
}

/**
 * Send active crime locations so backend can steer vehicles toward them (real movement along roads).
 */
export async function postCrimesForSteering(
  crimes: { lat: number; lng: number }[]
): Promise<void> {
  await fetch(`${API_BASE}/api/vehicles/crimes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crimes }),
  })
}

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
  /** Suggested number of units when inferred from transcript (e.g. "two people down" -> 2). */
  suggestedCount?: number
  /** preliminary | confirming | confirmed — so UI can show evolving confidence. */
  stage?: "preliminary" | "confirming" | "confirmed"
  /** Rationales that matched on the latest segment only (changes every response). */
  latestTrigger?: { rationale: string; severity: string }[]
  /** Live resource snapshot used in the LLM prompt (if any). */
  resourceContextUsed?: string
  /** Vehicle IDs closest + available for the incident (for map highlighting). */
  closestVehicleIds?: string[]
}

/**
 * Get dispatch recommendations from caller transcript (used during simulation).
 * POST /api/call-evaluation/assess
 * Pass incidentLocation so backend can rank closest available units and return closestVehicleIds.
 */
export async function assessCallTranscript(
  transcript: string,
  options?: { incidentLocation?: { lat: number; lng: number } }
): Promise<AssessCallTranscriptResponse> {
  const res = await fetch(`${API_BASE}/api/call-evaluation/assess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript,
      ...(options?.incidentLocation && { incidentLocation: options.incidentLocation }),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Assessment failed"
    )
  }
  return res.json() as Promise<AssessCallTranscriptResponse>
}

/** Response from GET /api/call-evaluation/closest (no LLM; for live map highlighting). */
export interface ClosestVehiclesResponse {
  closestVehicleIds: string[]
}

/**
 * Get closest available vehicle IDs for an incident location (no LLM).
 * GET /api/call-evaluation/closest?lat=...&lng=...
 * Use for live-updating map highlights as vehicles move.
 */
export async function fetchClosestVehicles(incidentLocation: {
  lat: number
  lng: number
}): Promise<ClosestVehiclesResponse> {
  const params = new URLSearchParams({
    lat: String(incidentLocation.lat),
    lng: String(incidentLocation.lng),
  })
  const res = await fetch(`${API_BASE}/api/call-evaluation/closest?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? "Closest vehicles failed")
  }
  return res.json() as Promise<ClosestVehiclesResponse>
}

/** One crime from GET /api/crimes (SF CSV, time-ordered for 3x sim). */
export interface CrimeRecord {
  id: string
  lat: number
  lng: number
  simSecondsFromMidnight: number
  category?: string
  address?: string
  description?: string
}

/**
 * Fetch crimes for a simulation day (GET /api/crimes?date=YYYY-MM-DD).
 * If date is omitted, backend returns a random day from the dataset.
 */
export async function fetchCrimesDay(
  date?: string
): Promise<{ date: string; crimes: CrimeRecord[] }> {
  const url = date
    ? `${API_BASE}/api/crimes?date=${encodeURIComponent(date)}`
    : `${API_BASE}/api/crimes`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(
      (err as { error?: string }).error ?? "Failed to load crimes"
    )
  }
  return res.json() as Promise<{ date: string; crimes: CrimeRecord[] }>
}
