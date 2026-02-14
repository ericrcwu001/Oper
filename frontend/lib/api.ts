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

/**
 * Generate initial caller audio for a scenario (POST /generate-call-audio).
 */
export async function generateCallAudio(
  scenario: ScenarioPayload
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
 */
export async function interact(
  scenario: ScenarioPayload,
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
 */
export async function interactWithVoice(
  scenario: ScenarioPayload,
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
