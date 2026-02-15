import { createClient } from "@/lib/supabase/client"
import type {
  TranscriptTurn,
  NoteEntry,
  Evaluation,
  ScenarioType,
  Difficulty,
  Session,
} from "@/lib/types"

/** Shape of the JSON stored in simulations.data */
export interface SimulationData {
  scenario?: {
    id?: string
    scenarioType?: ScenarioType
    title?: string
    description?: string
    difficulty?: Difficulty
    language?: string
    criticalInfo?: string[]
    expectedActions?: string[]
  }
  transcript: TranscriptTurn[]
  notes: NoteEntry[]
  evaluation?: Evaluation | null
  scenarioTimeline?: Record<string, string>
  startedAt?: string
  endedAt?: string
  durationSec?: number
  operatorSummary?: string
}

export interface SimulationRow {
  id: string
  user_id: string
  data: SimulationData
  created_at: string
}

const TABLE = "simulations"

/** Upsert a simulation (insert or update by id). Requires authenticated user. */
export async function saveSimulation(
  id: string,
  data: SimulationData
): Promise<{ error: Error | null }> {
  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { error: userError || new Error("Not authenticated") }
  }
  const { error } = await supabase.from(TABLE).upsert(
    {
      id,
      user_id: user.id,
      data,
    },
    { onConflict: "id" }
  )
  return { error: error ?? null }
}

/** Fetch one simulation by id. Returns null if not found or not owned. */
export async function getSimulation(
  id: string
): Promise<{ data: SimulationRow | null; error: Error | null }> {
  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { data: null, error: userError || new Error("Not authenticated") }
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (error) {
    if (error.code === "PGRST116") return { data: null, error: null }
    return { data: null, error }
  }
  return { data: data as SimulationRow, error: null }
}

/** List all simulations for the current user, newest first. */
export async function getSimulations(): Promise<{
  data: SimulationRow[];
  error: Error | null;
}> {
  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { data: [], error: userError || new Error("Not authenticated") }
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) return { data: [], error }
  return { data: (data ?? []) as SimulationRow[], error: null }
}

/** Normalize stored notes to Session.notes string (handles array of NoteEntry or plain string). */
function notesToString(notes: SimulationData["notes"]): string {
  if (notes == null) return ""
  if (typeof notes === "string") return notes
  if (!Array.isArray(notes)) return ""
  return notes
    .map((n) => (typeof n === "string" ? n : (n as NoteEntry).text))
    .filter(Boolean)
    .join("\n")
}

/** Normalize transcript so each turn has id, speaker, text (and optional timestamp). */
function normalizeTranscript(
  transcript: SimulationData["transcript"]
): Session["transcript"] {
  if (!transcript || !Array.isArray(transcript)) return []
  return transcript.map((t, i) => ({
    id: (t as TranscriptTurn).id ?? `t-${i}`,
    timestamp: typeof (t as TranscriptTurn).timestamp === "number" ? (t as TranscriptTurn).timestamp : 0,
    speaker: ((t as TranscriptTurn).speaker === "caller" || (t as TranscriptTurn).speaker === "operator")
      ? (t as TranscriptTurn).speaker
      : "operator",
    text: typeof (t as TranscriptTurn).text === "string" ? (t as TranscriptTurn).text : String(t),
  }))
}

/** Ensure date is an ISO string (handles Date objects from JSON). */
function toIsoString(value: string | Date | undefined, fallback: string): string {
  if (value == null) return fallback
  if (typeof value === "string") return value
  if (value instanceof Date) return value.toISOString()
  return fallback
}

/** Map a SimulationRow to the Session type used by dashboard/session drawer. */
export function simulationToSession(row: SimulationRow): Session {
  const d = row.data
  const scenario = d.scenario
  const createdIso = toIsoString(row.created_at, new Date().toISOString())

  const eval_ = d.evaluation
  const evaluation: Session["evaluation"] = {
    protocolAdherence: typeof eval_?.protocolAdherence === "number" ? eval_.protocolAdherence : 0,
    timeliness: typeof eval_?.timeliness === "number" ? eval_.timeliness : 0,
    criticalInfoCapture: typeof eval_?.criticalInfoCapture === "number" ? eval_.criticalInfoCapture : 0,
    overallScore: typeof eval_?.overallScore === "number" ? eval_.overallScore : 0,
    missedActions: Array.isArray(eval_?.missedActions) ? eval_.missedActions : [],
    feedbackBullets: Array.isArray(eval_?.feedbackBullets) ? eval_.feedbackBullets : [],
    transcriptHighlights: eval_?.transcriptHighlights,
  }

  const durationSec = typeof d.durationSec === "number" ? d.durationSec : 0

  return {
    id: row.id,
    scenarioId: scenario?.id ?? "unknown",
    scenarioType: (scenario?.scenarioType as Session["scenarioType"]) ?? "cardiac-arrest",
    scenarioTitle: scenario?.title ?? "Simulation",
    difficulty: (scenario?.difficulty as Difficulty) ?? "medium",
    language: (scenario?.language as Session["language"]) ?? "en",
    startedAt: toIsoString(d.startedAt, createdIso),
    endedAt: toIsoString(d.endedAt, createdIso),
    durationSec,
    transcript: normalizeTranscript(d.transcript),
    notes: notesToString(d.notes),
    operatorSummary: typeof d.operatorSummary === "string" ? d.operatorSummary : "",
    evaluation,
  }
}
