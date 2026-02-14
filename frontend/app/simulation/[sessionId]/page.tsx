"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
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
import { scenarios, callerScripts } from "@/lib/mock-data"
import type { TranscriptTurn, ConnectionStatus, ScenarioType } from "@/lib/types"
import { cn } from "@/lib/utils"

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
  const scenarioId = searchParams.get("scenario") || "scenario-1"
  const hintsEnabled = searchParams.get("hints") === "true"

  const scenario = scenarios.find((s) => s.id === scenarioId) || scenarios[0]
  const ScenarioIcon = scenarioIcons[scenario.scenarioType] || Heart
  const script = callerScripts[scenario.scenarioType] || callerScripts["cardiac-arrest"]

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

  const scriptIndexRef = useRef(0)
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
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

  const streamNextCallerLine = useCallback(() => {
    if (scriptIndexRef.current >= script.length) return

    const fullText = script[scriptIndexRef.current]
    const words = fullText.split(" ")
    let wordIdx = 0

    // Show partial text word by word
    const partialInterval = setInterval(() => {
      if (wordIdx < words.length) {
        setPartialText(words.slice(0, wordIdx + 1).join(" "))
        wordIdx++
      } else {
        clearInterval(partialInterval)
        setPartialText("")
        // Add final turn
        setTranscript((prev) => [
          ...prev,
          {
            id: `t-${Date.now()}`,
            timestamp: Math.floor(
              (Date.now() - (streamIntervalRef.current ? Date.now() : Date.now())) / 1000
            ) || prev.length * 5,
            speaker: "caller",
            text: fullText,
          },
        ])
        scriptIndexRef.current++
      }
    }, 180)

    return () => clearInterval(partialInterval)
  }, [script])

  // Hint system
  useEffect(() => {
    if (!callActive || !hintsEnabled) {
      setCurrentHint("")
      return
    }
    const hints = scenario.expectedActions
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
  }, [callActive, hintsEnabled, scenario.expectedActions])

  const handleStartCall = () => {
    setConnectionStatus("connecting")
    setWsError(false)
    setTimeout(() => {
      setConnectionStatus("connected")
      setCallActive(true)
      setCallSeconds(0)
      scriptIndexRef.current = 0
      setTranscript([])

      // Start streaming caller lines every 8 seconds
      streamNextCallerLine()
      streamIntervalRef.current = setInterval(() => {
        streamNextCallerLine()
      }, 8000)
    }, 1500)
  }

  const handleEndCall = () => {
    setCallActive(false)
    setConnectionStatus("disconnected")
    setPartialText("")
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current)
    // Navigate to review
    router.push(`/simulation/${sessionId}/review?scenario=${scenarioId}`)
  }

  const handleSendText = () => {
    if (!textInput.trim() || !callActive) return
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: textInput.trim(),
      },
    ])
    setTextInput("")
    // Trigger next caller line after operator speaks
    setTimeout(() => streamNextCallerLine(), 2000)
  }

  const handleRequestClarification = () => {
    if (!callActive) return
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-clar-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: "Can you please repeat that? I need to make sure I have the correct information.",
      },
    ])
    setTimeout(() => streamNextCallerLine(), 2500)
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
              Live Simulation
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
                disabled={connectionStatus === "connecting"}
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

        {/* WS Error */}
        {wsError && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>WebSocket disconnected.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setWsError(false)
                handleStartCall()
              }}
            >
              Retry
            </Button>
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
                <div className="mb-2 flex items-center gap-2">
                  <ScenarioIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {scenario.title}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Caller: {scenario.callerProfile.name},{" "}
                  {scenario.callerProfile.age}y,{" "}
                  {scenario.callerProfile.emotion}
                </p>
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
                <AudioControl disabled={!callActive} />
              </div>

              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Microphone
                </p>
                <MicControl disabled={!callActive} />
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
                  disabled={!callActive || !textInput.trim()}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestClarification}
                  disabled={!callActive}
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
            <NotesPanel callSeconds={callSeconds} />
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
