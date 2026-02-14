"use client"

import { useState, useEffect, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { TranscriptFeed } from "@/components/transcript-feed"
import { MicControl } from "@/components/mic-control"
import { AudioControl } from "@/components/audio-control"
import { NotesPanel } from "@/components/notes-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Phone,
  PhoneOff,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Heart,
  Flame,
  Car,
  Send,
  HelpCircle,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react"
import { scenarios } from "@/lib/mock-data"
import {
  generateCallAudio,
  interact,
  interactWithVoice,
  assessCallTranscript,
  type GeneratedScenarioPayload,
  type CallScenarioInput,
} from "@/lib/api"
import type {
  TranscriptTurn,
  ConnectionStatus,
  ScenarioType,
  Scenario,
  NoteEntry,
  Difficulty,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const GENERATED_SCENARIO_STORAGE_KEY = "simulation-generated-scenario"

function buildScenarioPayload(
  scenario: Scenario,
  difficulty?: Difficulty
): {
  scenarioDescription: string
  callerDescription: string
  difficulty?: Difficulty
} {
  return {
    scenarioDescription: scenario.description,
    callerDescription: scenario.callerDescription,
    difficulty: difficulty ?? scenario.difficulty,
  }
}

/** Map generator payload to frontend Scenario for UI and hints. */
function payloadToScenario(payload: GeneratedScenarioPayload): Scenario {
  const s = payload.scenario
  const type = (
    ["cardiac-arrest", "fire", "traffic-accident"] as ScenarioType[]
  ).includes(s.scenario_type as ScenarioType)
    ? (s.scenario_type as ScenarioType)
    : "cardiac-arrest"
  const p = s.caller_profile
  return {
    id: s.id,
    scenarioType: type,
    title: s.title,
    description: s.description,
    callerDescription: `${p.name}, ${p.age}y, ${p.emotion}`,
    callerProfile: {
      name: p.name,
      age: p.age,
      emotion: p.emotion,
    },
    criticalInfo: s.critical_info ?? [],
    expectedActions: s.expected_actions ?? [],
    optionalComplications: s.optional_complications ?? [],
    difficulty: s.difficulty as Scenario["difficulty"],
    language: (s.language as Scenario["language"]) || "en",
  }
}

const scenarioIcons: Record<string, React.ElementType> = {
  "cardiac-arrest": Heart,
  fire: Flame,
  "traffic-accident": Car,
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function LiveSimulationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const scenarioIdFromUrl = searchParams.get("scenario")
  const hintsEnabled = searchParams.get("hints") === "true"
  const selectedDifficulty = (searchParams.get("difficulty") as Difficulty) || "medium"

  const fallbackScenario =
    scenarios.find((s) => s.id === (scenarioIdFromUrl || "scenario-1")) ||
    scenarios[0]
  const [scenario, setScenario] = useState<Scenario>(fallbackScenario)
  const [scenarioPayload, setScenarioPayload] =
    useState<GeneratedScenarioPayload | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(
        `${GENERATED_SCENARIO_STORAGE_KEY}-${sessionId}`
      )
      if (raw) {
        const payload = JSON.parse(raw) as GeneratedScenarioPayload
        if (payload?.scenario) {
          setScenario(payloadToScenario(payload))
          setScenarioPayload(payload)
          return
        }
      }
    } catch {
      // ignore
    }
    setScenario(fallbackScenario)
    setScenarioPayload(null)
  }, [sessionId, scenarioIdFromUrl])

  const scenarioForApi: CallScenarioInput =
    scenarioPayload ?? buildScenarioPayload(scenario, selectedDifficulty)
  const ScenarioIcon =
    scenarioIdFromUrl === "generated"
      ? Activity
      : (scenarioIcons[scenario.scenarioType] || Heart)
  const scenarioId = scenario.id

  const [callActive, setCallActive] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])
  const [partialText, setPartialText] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [latency, setLatency] = useState(0)
  const [loading, setLoading] = useState(true)
  const [textInput, setTextInput] = useState("")
  const [wsError, setWsError] = useState(false)
  const [currentHint, setCurrentHint] = useState("")
  const [callerAudioUrl, setCallerAudioUrl] = useState<string | null>(null)
  const [conversationHistory, setConversationHistory] = useState<
    { role: "caller" | "operator"; content: string }[]
  >([])
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [dispatchRecommendation, setDispatchRecommendation] = useState<{
    units: { unit: string; rationale?: string; severity?: string }[]
    severity: string
    critical?: boolean
  } | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulated loading
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200)
    return () => clearTimeout(t)
  }, [])

  // Call timer
  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callActive])

  // Latency updater
  useEffect(() => {
    if (callActive) {
      const interval = setInterval(() => {
        setLatency(Math.floor(Math.random() * 40 + 20))
      }, 2000)
      return () => clearInterval(interval)
    }
    setLatency(0)
  }, [callActive])

  // Live eval: assess caller transcript for dispatch recommendations during the call
  useEffect(() => {
    if (!callActive || conversationHistory.length === 0) {
      setDispatchRecommendation(null)
      return
    }
    const callerTranscript = conversationHistory
      .filter((t) => t.role === "caller")
      .map((t) => t.content)
      .join(" ")
      .trim()
    if (!callerTranscript) return
    assessCallTranscript(callerTranscript)
      .then(setDispatchRecommendation)
      .catch(() => setDispatchRecommendation(null))
  }, [callActive, conversationHistory])

  // Hint system
  const hintActions =
    scenarioPayload?.scenario?.expected_actions ?? scenario.expectedActions
  useEffect(() => {
    if (!callActive || !hintsEnabled) {
      setCurrentHint("")
      return
    }
    const hints = hintActions
    let hintIdx = 0
    const interval = setInterval(() => {
      if (hintIdx < hints.length) {
        setCurrentHint(hints[hintIdx])
        hintIdx++
      }
    }, 12000)
    // Show first hint after 5s
    const firstHint = setTimeout(() => {
      setCurrentHint(hints[0] || "")
      hintIdx = 1
    }, 5000)
    return () => {
      clearInterval(interval)
      clearTimeout(firstHint)
    }
  }, [callActive, hintsEnabled, hintActions])

  const handleStartCall = async () => {
    if (scenarioIdFromUrl === "generated" && !scenarioPayload) {
      setApiError("Generated scenario not found. Please start again from the setup page.")
      return
    }
    setConnectionStatus("connecting")
    setWsError(false)
    setApiError(null)
    setTranscript([])
    setCallerAudioUrl(null)
    setConversationHistory([])
    setNotes([])
    try {
      const data = await generateCallAudio(scenarioForApi)
      setCallerAudioUrl(data.audioUrl)
      setTranscript([
        {
          id: `t-${Date.now()}`,
          timestamp: 0,
          speaker: "caller",
          text: data.transcript,
        },
      ])
      setConversationHistory([{ role: "caller", content: data.transcript }])
      setCallActive(true)
      setConnectionStatus("connected")
      setCallSeconds(0)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to start call")
      setConnectionStatus("disconnected")
    }
  }

  const handleEndCall = () => {
    setCallActive(false)
    setConnectionStatus("disconnected")
    setPartialText("")
    setCallerAudioUrl(null)
    setConversationHistory([])
    setDispatchRecommendation(null)
    try {
      sessionStorage.setItem(
        `simulation-transcript-${sessionId}`,
        JSON.stringify(transcript)
      )
      sessionStorage.setItem(
        `simulation-notes-${sessionId}`,
        JSON.stringify(notes)
      )
    } catch {
      // ignore storage errors
    }
    router.push(`/simulation/${sessionId}/review?scenario=${scenarioId}`)
  }

  const handleSendText = async () => {
    const message = textInput.trim()
    if (!message || !callActive) return
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: message,
      },
    ])
    setTextInput("")
    setApiError(null)
    setApiLoading(true)
    try {
      const data = await interact(scenarioForApi, message, conversationHistory)
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to get caller response")
    } finally {
      setApiLoading(false)
    }
  }

  const handleRequestClarification = async () => {
    if (!callActive) return
    const message =
      "Can you please repeat that? I need to make sure I have the correct information."
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-clar-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: message,
      },
    ])
    setApiError(null)
    setApiLoading(true)
    try {
      const data = await interact(scenarioForApi, message, conversationHistory)
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to get caller response")
    } finally {
      setApiLoading(false)
    }
  }

  const handleVoiceRecordingComplete = async (blob: Blob) => {
    if (!callActive) return
    setApiError(null)
    setApiLoading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => {
          const dataUrl = r.result as string
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : ""
          resolve(base64)
        }
        r.onerror = () => reject(new Error("Failed to read recording"))
        r.readAsDataURL(blob)
      })
      const data = await interactWithVoice(
        scenarioForApi,
        base64,
        conversationHistory
      )
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      const operatorTurn = data.conversationHistory[data.conversationHistory.length - 2]
      const operatorText =
        operatorTurn?.role === "operator" ? operatorTurn.content : "[Voice]"
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-op-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "operator",
          text: operatorText,
        },
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(
        e instanceof Error ? e.message : "Failed to send voice message"
      )
    } finally {
      setApiLoading(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
          <div className="mb-6 flex flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
            <Skeleton className="h-[500px] rounded-lg" />
            <Skeleton className="h-[500px] rounded-lg" />
            <Skeleton className="h-[500px] rounded-lg" />
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col px-4 lg:px-6">
        {/* Compact header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Live Call</h1>
            <span className="text-xs text-muted-foreground">Session {sessionId}</span>
            {scenarioPayload?.scenario?.title ?? scenario.title ? (
              <span className="truncate text-sm text-muted-foreground">
                — {scenarioPayload?.scenario?.title ?? scenario.title}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {callActive && (
              <>
                <span className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(callSeconds)}
                </span>
                {connectionStatus === "connected" && (
                  <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent text-xs">
                    <Activity className="h-3 w-3 animate-pulse" />
                    Live
                  </Badge>
                )}
              </>
            )}
            {!callActive ? (
              <Button
                onClick={handleStartCall}
                size="sm"
                className="gap-1.5"
                disabled={
                  connectionStatus === "connecting" ||
                  (scenarioIdFromUrl === "generated" && !scenarioPayload)
                }
              >
                {connectionStatus === "connecting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                {connectionStatus === "connecting" ? "Connecting..." : "Start Call"}
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleEndCall} className="gap-1.5">
                <PhoneOff className="h-4 w-4" />
                End Call
              </Button>
            )}
          </div>
        </div>

        {/* Errors */}
        {(wsError || apiError) && (
          <div className="flex shrink-0 items-center gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{apiError ?? "WebSocket disconnected."}</span>
            {!callActive && (
              <Button size="sm" variant="outline" onClick={() => { setWsError(false); setApiError(null); handleStartCall(); }}>
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Hint */}
        {currentHint && hintsEnabled && callActive && (
          <div className="flex shrink-0 items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm">
            <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground"><span className="font-medium">Hint:</span> {currentHint}</span>
          </div>
        )}

        {/* Main: Left = transcript (main), Right = controls + notes + dispatch */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 py-4 lg:flex-row">
          {/* Left — Live transcription (main) */}
          <div className="flex min-h-[240px] min-w-0 flex-1 flex-col lg:min-h-0">
            <Card className="flex min-h-0 flex-1 flex-col border bg-card overflow-hidden">
              <CardHeader className="shrink-0 border-b py-3">
                <CardTitle className="text-base font-medium">Live transcription</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Caller and operator — scroll to see full conversation
                </p>
              </CardHeader>
              <div className="min-h-0 flex-1 overflow-hidden">
                <TranscriptFeed turns={transcript} partialText={partialText} />
              </div>
            </Card>
          </div>

          {/* Right — Compact controls, operator notes, dispatch */}
          <div className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto lg:min-h-0 lg:w-[360px]">
            {/* Controls: compact row(s) */}
            <Card className="shrink-0 border bg-card">
              <CardContent className="space-y-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Audio</span>
                    <AudioControl audioUrl={callerAudioUrl} disabled={!callActive} />
                  </div>
                  <MicControl
                    disabled={!callActive}
                    onRecordingComplete={handleVoiceRecordingComplete}
                    sending={apiLoading}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Type message..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendText() }}
                    disabled={!callActive}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={handleSendText}
                    disabled={!callActive || !textInput.trim() || apiLoading}
                    aria-label="Send"
                  >
                    {apiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2"
                    onClick={handleRequestClarification}
                    disabled={!callActive || apiLoading}
                    title="Request clarification"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Operator notes — main space for dispatcher */}
            <Card className="flex min-h-0 flex-1 flex-col border bg-card overflow-hidden">
              <NotesPanel
                callSeconds={callSeconds}
                notes={notes}
                onAddNote={(entry) => setNotes((prev) => [...prev, entry])}
              />
            </Card>

            {/* Dispatch (live evaluation) */}
            <Card className="shrink-0 border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Dispatch recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!callActive ? (
                  <p className="text-xs text-muted-foreground">
                    Start a call to see live dispatch suggestions from the caller&apos;s words.
                  </p>
                ) : !dispatchRecommendation ? (
                  <p className="text-xs text-muted-foreground">
                    Updates as the caller speaks. Keywords like &quot;fire&quot; or &quot;not breathing&quot; trigger suggestions.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Severity:{" "}
                      <span
                        className={cn(
                          "font-medium",
                          dispatchRecommendation.severity === "critical" && "text-red-500",
                          dispatchRecommendation.severity === "high" && "text-orange-500",
                          dispatchRecommendation.severity === "medium" && "text-yellow-500"
                        )}
                      >
                        {dispatchRecommendation.severity}
                        {dispatchRecommendation.critical && " (critical)"}
                      </span>
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-xs">
                      {dispatchRecommendation.units.map((u, i) => (
                        <li key={i}>
                          <span className="font-medium">{u.unit}</span>
                          {u.rationale && (
                            <span className="text-muted-foreground"> — {u.rationale}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
