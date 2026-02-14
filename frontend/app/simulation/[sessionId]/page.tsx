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
} from "lucide-react"
import { scenarios } from "@/lib/mock-data"
import {
  generateCallAudio,
  interact,
  interactWithVoice,
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
import type { MapPoint } from "@/lib/map-types"
import { SFMap } from "@/components/sf-map"
import { cn } from "@/lib/utils"

/** Initial map points with hardcoded popup data (no backend). */
function getInitialMapPoints(): MapPoint[] {
  return [
    {
      id: "call-1",
      type: "911",
      lat: 37.7749,
      lng: -122.4194,
      location: "2500 Mission St, SF",
      description: "Cardiac arrest reported",
      callerId: "CALL-001",
      callerName: "Jane Doe",
      timestamp: "14:32",
    },
    {
      id: "unit-p1",
      type: "police",
      lat: 37.78,
      lng: -122.41,
      location: "Mission District",
      officerInCharge: "Sgt. Smith",
      unitId: "PD-12",
      status: "En route",
    },
    {
      id: "unit-f1",
      type: "fire",
      lat: 37.768,
      lng: -122.43,
      location: "SOMA",
      officerInCharge: "Capt. Jones",
      unitId: "FD-7",
      status: "Standing by",
    },
  ]
}

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
  const [mapPoints, setMapPoints] = useState<MapPoint[]>(getInitialMapPoints)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tick30Ref = useRef<ReturnType<typeof setInterval> | null>(null)
  const angleRef = useRef(0)

  // Simulated loading
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200)
    return () => clearTimeout(t)
  }, [])

  // 30 tps tick: update map points (animate police unit in small circle for live demo)
  useEffect(() => {
    const TICK_MS = 1000 / 30
    tick30Ref.current = setInterval(() => {
      setMapPoints((prev) => {
        const base = getInitialMapPoints()
        const police = base.find((p) => p.id === "unit-p1")
        if (!police || police.type !== "police") return prev
        angleRef.current += (2 * Math.PI * 0.2) / 30
        const r = 0.003
        const lat = 37.78 + r * Math.sin(angleRef.current)
        const lng = -122.41 + r * Math.cos(angleRef.current)
        return base.map((p) =>
          p.id === "unit-p1" ? { ...p, lat, lng } : p
        )
      })
    }, TICK_MS)
    return () => {
      if (tick30Ref.current) clearInterval(tick30Ref.current)
    }
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
      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6 lg:py-6">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              Live Call
            </h1>
            <p className="text-sm text-muted-foreground">
              Session {sessionId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connectionStatus === "connected" && (
              <Badge
                variant="outline"
                className="border-accent/30 bg-accent/10 text-accent gap-1.5"
              >
                <Activity className="h-3 w-3 animate-pulse" />
                Streaming
              </Badge>
            )}
            {!callActive ? (
              <Button
                onClick={handleStartCall}
                className="gap-2"
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
                {connectionStatus === "connecting"
                  ? "Connecting..."
                  : "Start Call"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleEndCall}
                className="gap-2"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </Button>
            )}
          </div>
        </div>

        {/* API / connection errors */}
        {(wsError || apiError) && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{apiError ?? "WebSocket disconnected."}</span>
            {!callActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setWsError(false)
                  setApiError(null)
                  handleStartCall()
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Hint bar */}
        {currentHint && hintsEnabled && callActive && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
            <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground">
              <span className="font-medium">Hint:</span> {currentHint}
            </span>
          </div>
        )}

        {/* Map - full-width top row */}
        <Card className="mb-4 overflow-hidden border bg-card">
          <div className="relative h-[600px] min-h-[400px] w-full">
            <SFMap
              points={mapPoints}
              selectedPointId={selectedPointId}
              onSelectPoint={setSelectedPointId}
              className="absolute inset-0 h-full w-full"
            />
            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-10 flex gap-4 rounded-md border border-border/80 bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" aria-hidden />
                911
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" aria-hidden />
                Police
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" aria-hidden />
                Fire
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" aria-hidden />
                Ambulance
              </span>
            </div>
          </div>
        </Card>

        {/* 3-column layout */}
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
          {/* Left - Call Status */}
          <Card className="border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Call Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Scenario */}
              <div className="rounded-lg border bg-muted/50 p-3">
                {scenarioIdFromUrl === "generated" && !scenarioPayload ? (
                  <p className="text-xs text-muted-foreground">
                    No generated call in this session. Return to setup and use
                    &quot;Generate call &amp; start&quot; to begin.
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <ScenarioIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {scenarioPayload?.scenario?.title ?? scenario.title}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Caller:{" "}
                      {scenarioPayload?.scenario?.caller_profile
                        ? `${scenarioPayload.scenario.caller_profile.name}, ${scenarioPayload.scenario.caller_profile.age}y, ${scenarioPayload.scenario.caller_profile.emotion}`
                        : `${scenario.callerProfile.name}, ${scenario.callerProfile.age}y, ${scenario.callerProfile.emotion}`}
                    </p>
                  </>
                )}
              </div>

              {/* Connection */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Connection</span>
                <div className="flex items-center gap-1.5">
                  {connectionStatus === "connected" ? (
                    <>
                      <Wifi className="h-3.5 w-3.5 text-accent" />
                      <span className="text-accent">Connected</span>
                    </>
                  ) : connectionStatus === "connecting" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--warning))]" />
                      <span className="text-[hsl(var(--warning))]">
                        Connecting
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Disconnected
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Timer */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Call Timer</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={cn(callActive && "text-foreground")}>
                    {formatTime(callSeconds)}
                  </span>
                </div>
              </div>

              {/* Latency */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Latency</span>
                <span className="font-mono text-muted-foreground">
                  {latency > 0 ? `${latency}ms` : "--"}
                </span>
              </div>

              {/* Audio Controls */}
              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Caller Audio
                </p>
                <AudioControl
                  audioUrl={callerAudioUrl}
                  disabled={!callActive}
                />
              </div>

              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Microphone
                </p>
                <MicControl
                  disabled={!callActive}
                  onRecordingComplete={handleVoiceRecordingComplete}
                  sending={apiLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Center - Transcript */}
          <Card className="flex flex-col border bg-card">
            <CardHeader className="shrink-0 border-b pb-3">
              <CardTitle className="text-sm">Conversation</CardTitle>
            </CardHeader>
            <div className="min-h-0 flex-1" style={{ height: "420px" }}>
              <TranscriptFeed turns={transcript} partialText={partialText} />
            </div>
            {/* Sticky fallback input */}
            <div className="shrink-0 border-t p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Send text (fallback)..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendText()
                  }}
                  disabled={!callActive}
                  className="text-sm"
                />
                <Button
                  size="icon"
                  onClick={handleSendText}
                  disabled={!callActive || !textInput.trim() || apiLoading}
                  aria-label="Send message"
                >
                  {apiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestClarification}
                  disabled={!callActive || apiLoading}
                  className="shrink-0 gap-1 text-xs"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clarify</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Right - Notes */}
          <Card className="flex flex-col border bg-card" style={{ height: "560px" }}>
            <NotesPanel
                callSeconds={callSeconds}
                notes={notes}
                onAddNote={(entry) => setNotes((prev) => [...prev, entry])}
              />
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
