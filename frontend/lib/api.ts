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

/** Payload returned by POST /api/scenarios/generate (scenario generator). */
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
    optional_complications: string[]
    difficulty: string
    language: string
  }
  persona?: { stability?: number; style?: number; speed?: number; voice_description?: string }
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

/**
 * Generate a unique scenario for the given difficulty (POST /api/scenarios/generate).
 * Use the returned payload for the call simulation and pass it as scenarioPayload to generateCallAudio/interact.
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
 * Generate initial caller audio (POST /generate-call-audio).
 * Pass either scenarioPayload (from generateScenario) or a scenario string.
 */
export async function generateCallAudio(
  scenarioOrPayload: string | GeneratedScenarioPayload
): Promise<GenerateCallAudioResponse> {
  const body =
    typeof scenarioOrPayload === "string"
      ? { scenario: scenarioOrPayload }
      : { scenarioPayload: scenarioOrPayload }
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
 * Pass either scenarioPayload (from generateScenario) or a scenario string.
 */
export async function interact(
  scenarioOrPayload: string | GeneratedScenarioPayload,
  userInput: string,
  conversationHistory: { role: "caller" | "operator"; content: string }[]
): Promise<InteractResponse> {
  const body =
    typeof scenarioOrPayload === "string"
      ? { scenario: scenarioOrPayload }
      : { scenarioPayload: scenarioOrPayload }
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
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
 * Pass either scenarioPayload (from generateScenario) or a scenario string.
 */
export async function interactWithVoice(
  scenarioOrPayload: string | GeneratedScenarioPayload,
  userInputAudioBase64: string,
  conversationHistory: { role: "caller" | "operator"; content: string }[]
): Promise<InteractResponse> {
  const body =
    typeof scenarioOrPayload === "string"
      ? { scenario: scenarioOrPayload }
      : { scenarioPayload: scenarioOrPayload }
  const res = await fetch(`${API_BASE}/interact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
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
