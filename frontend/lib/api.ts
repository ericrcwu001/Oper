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
      gender: string
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
}

/** Scenario sent to generate-call-audio / interact: simple payload or full generator payload. */
export type CallScenarioInput = ScenarioPayload | GeneratedScenarioPayload

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

/**
 * Generate initial caller audio for a scenario (POST /generate-call-audio).
 * Accepts simple ScenarioPayload or full GeneratedScenarioPayload for voice + persona settings.
 */
export async function generateCallAudio(
  scenario: CallScenarioInput
): Promise<GenerateCallAudioResponse> {
  const res = await fetch(`${API_BASE}/generate-call-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
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
  conversationHistory: { role: "caller" | "operator"; content: string }[]
): Promise<InteractResponse> {
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario,
      userInput,
      conversationHistory,
    }),
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
  conversationHistory: { role: "caller" | "operator"; content: string }[]
): Promise<InteractResponse> {
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario,
      userInputAudio: userInputAudioBase64,
      conversationHistory,
    }),
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
 */
export async function evaluateCall(
  transcript: { speaker: string; text: string; timestamp?: number }[],
  notes: { text: string; tag?: string; timestamp?: number }[],
  scenarioDescription: string
): Promise<Evaluation> {
  const res = await fetch(`${API_BASE}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript,
      notes,
      scenarioDescription,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? "Evaluation failed")
  }
  return res.json() as Promise<Evaluation>
}
