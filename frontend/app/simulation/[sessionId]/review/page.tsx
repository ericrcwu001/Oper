"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { ScoreCard } from "@/components/score-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Shield,
  Clock,
  Target,
  Award,
  AlertTriangle,
  Lightbulb,
  Search,
  RotateCcw,
  Plus,
  LayoutDashboard,
  CheckCircle2,
  ListOrdered,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { scenarios, callerScripts } from "@/lib/mock-data"
import { evaluateCall } from "@/lib/api"
import type {
  TranscriptTurn,
  Evaluation,
  NoteEntry,
  TranscriptHighlight,
} from "@/lib/types"
import { cn } from "@/lib/utils"

// Generate a mock evaluation
function generateEvaluation(): Evaluation {
  return {
    protocolAdherence: 85,
    timeliness: 78,
    criticalInfoCapture: 82,
    overallScore: 82,
    missedActions: [
      "Did not confirm callback number",
      "Delayed dispatch instruction",
      "Did not ask about allergies or medication",
    ],
    feedbackBullets: [
      "Good use of clear, calm language throughout the call",
      "Remember to always confirm callback number in the first 30 seconds",
      "Practice quicker dispatch triggers for this scenario type",
      "Consider asking about medications early for cardiac scenarios",
    ],
  }
}

// Generate mock transcript for review
function generateReviewTranscript(scenarioType: string): TranscriptTurn[] {
  const lines = callerScripts[scenarioType] || callerScripts["cardiac-arrest"]
  const turns: TranscriptTurn[] = []
  const operatorResponses = [
    "911, what is your emergency?",
    "Can you tell me the exact address?",
    "Is anyone injured?",
    "Stay on the line. Help is on the way.",
    "Can you describe what you see?",
    "Are you in a safe location?",
  ]
  let ts = 0
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (i < operatorResponses.length) {
      turns.push({
        id: `rev-op-${i}`,
        timestamp: ts,
        speaker: "operator",
        text: operatorResponses[i],
      })
      ts += 4
    }
    turns.push({
      id: `rev-cal-${i}`,
      timestamp: ts,
      speaker: "caller",
      text: lines[i],
    })
    ts += 5
  }
  return turns
}

function formatTs(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Timeline entries sorted by seconds for display. */
function timelineEntries(timeline: Record<string, string> | undefined): { seconds: number; text: string }[] {
  if (!timeline || typeof timeline !== "object") return []
  return Object.entries(timeline)
    .map(([k, v]) => ({ seconds: parseInt(k, 10), text: typeof v === "string" ? v.trim() : String(v) }))
    .filter((e) => !Number.isNaN(e.seconds) && e.text)
    .sort((a, b) => a.seconds - b.seconds)
}

const STORAGE_KEY_GENERATED = "simulation-generated-scenario"

export default function ReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const searchParams = useSearchParams()
  const scenarioIdFromUrl = searchParams.get("scenario")

  const [scenario, setScenario] = useState(() =>
    scenarios.find((s) => s.id === (scenarioIdFromUrl || "scenario-1")) || scenarios[0]
  )
  const [scenarioTimeline, setScenarioTimeline] = useState<Record<string, string>>({})

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const raw = sessionStorage.getItem(`${STORAGE_KEY_GENERATED}-${sessionId}`)
      if (raw) {
        const payload = JSON.parse(raw) as {
          scenario?: { title?: string; description?: string }
          timeline?: Record<string, string>
        }
        if (payload?.scenario?.title != null) {
          setScenario((prev) => ({
            ...(prev || {}),
            title: payload.scenario?.title ?? prev?.title,
            description: payload.scenario?.description ?? prev?.description,
          }))
        }
        if (payload?.timeline != null && typeof payload.timeline === "object" && !Array.isArray(payload.timeline)) {
          setScenarioTimeline(payload.timeline)
        }
      }
    } catch {
      // ignore
    }
  }, [sessionId])

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [reviewTranscript, setReviewTranscript] = useState<TranscriptTurn[]>(
    () => generateReviewTranscript(scenario.scenarioType)
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [reviewNotes, setReviewNotes] = useState<NoteEntry[]>([])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const rawT = sessionStorage.getItem(`simulation-transcript-${sessionId}`)
      if (rawT) {
        const parsed = JSON.parse(rawT) as TranscriptTurn[]
        if (Array.isArray(parsed)) setReviewTranscript(parsed)
      }
      const rawN = sessionStorage.getItem(`simulation-notes-${sessionId}`)
      if (rawN) {
        const parsed = JSON.parse(rawN) as NoteEntry[]
        if (Array.isArray(parsed)) setReviewNotes(parsed)
      }
    } catch {
      // ignore
    }
  }, [sessionId])

  useEffect(() => {
    if (reviewTranscript.length === 0) {
      setEvaluation(generateEvaluation())
      return
    }
    let cancelled = false
    evaluateCall(
      reviewTranscript,
      reviewNotes,
      scenario.description || "911 emergency call",
      Object.keys(scenarioTimeline).length > 0 ? scenarioTimeline : undefined
    )
      .then((e) => {
        if (!cancelled) setEvaluation(e)
      })
      .catch(() => {
        if (!cancelled) setEvaluation(generateEvaluation())
      })
    return () => {
      cancelled = true
    }
  }, [reviewTranscript, reviewNotes, scenario.description, scenarioTimeline])

  const filteredTranscript = searchQuery
    ? reviewTranscript.filter((t) =>
        t.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : reviewTranscript

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl pl-14 pr-4 py-10 lg:pl-16 lg:pr-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                Session Complete
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Post-Call Evaluation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {scenario.title} - Session {sessionId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="gap-2">
              <Link href={`/simulation/${sessionId}?scenario=${scenario.id}`}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link href="/simulation">
                <Plus className="h-4 w-4" />
                New Call
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        {/* Score Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {evaluation === null ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[100px] rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <ScoreCard
                label="Protocol Adherence"
                score={evaluation.protocolAdherence}
                icon={Shield}
              />
              <ScoreCard
                label="Timeliness"
                score={evaluation.timeliness}
                icon={Clock}
              />
              <ScoreCard
                label="Critical Info Captured"
                score={evaluation.criticalInfoCapture}
                icon={Target}
              />
              <ScoreCard
                label="Overall Score"
                score={evaluation.overallScore}
                icon={Award}
              />
            </>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Missed Actions */}
            <Card className="border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Missed Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {evaluation === null ? (
                  <Skeleton className="h-32 w-full rounded-md" />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {evaluation.missedActions.map((action, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-md border bg-destructive/5 px-3 py-2 text-sm text-foreground"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        {action}
                      </li>
                    ))}
                    {evaluation.missedActions.length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No missed actions. Excellent work!
                      </p>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Feedback */}
            <Card className="border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Feedback
                </CardTitle>
              </CardHeader>
              <CardContent>
                {evaluation === null ? (
                  <Skeleton className="h-32 w-full rounded-md" />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {evaluation.feedbackBullets.map((fb, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-foreground"
                      >
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {fb}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Scenario timeline (fixed external events) */}
            {timelineEntries(scenarioTimeline).length > 0 && (
              <Card className="border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListOrdered className="h-4 w-4 text-muted-foreground" />
                    Scenario Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {timelineEntries(scenarioTimeline).map(({ seconds, text }) => (
                      <li
                        key={seconds}
                        className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTs(seconds)}
                        </span>
                        <span className="text-foreground">{text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Operator Summary – notes taken during the call */}
            <Card className="border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Operator Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {reviewNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No notes from this call.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {reviewNotes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-md border bg-muted/50 px-3 py-2 text-sm"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatTs(n.timestamp)}
                          </span>
                          {n.tag && (
                            <Badge variant="outline" className="text-[10px]">
                              {n.tag}
                            </Badge>
                          )}
                        </div>
                        <p className="text-foreground">{n.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Transcript */}
          <Card className="flex flex-col border bg-card">
            <CardHeader className="shrink-0 border-b pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Transcript Review
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-48 pl-8 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1" style={{ height: "600px" }}>
              <div className="flex flex-col gap-3 p-4">
                {filteredTranscript.map((turn) => {
                  const turnIndex = reviewTranscript.findIndex(
                    (t) => t.id === turn.id
                  )
                  const isOperatorTurn = turn.speaker === "operator"
                  let highlights: TranscriptHighlight[] =
                    evaluation?.transcriptHighlights?.filter(
                      (h) => h.turnIndex === turnIndex
                    ) ?? []
                  if (!isOperatorTurn) highlights = []
                  else {
                    const negative = highlights.filter(
                      (h) =>
                        h.type === "missed_action" || h.type === "red_flag"
                    )
                    if (negative.length > 1) {
                      highlights = [
                        ...highlights.filter(
                          (h) =>
                            h.type !== "missed_action" && h.type !== "red_flag"
                        ),
                        negative[0],
                      ]
                    }
                  }
                  const hasHighlights = highlights.length > 0
                  return (
                    <div
                      key={turn.id}
                      className={cn(
                        "flex flex-col gap-1",
                        turn.speaker === "operator"
                          ? "items-end"
                          : "items-start"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatTs(turn.timestamp)}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            turn.speaker === "caller"
                              ? "text-[hsl(var(--warning))]"
                              : "text-primary"
                          )}
                        >
                          {turn.speaker === "caller"
                            ? "Caller"
                            : "Operator"}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                          turn.speaker === "operator"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground",
                          searchQuery &&
                            turn.text
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) &&
                            "ring-2 ring-primary/50",
                          hasHighlights && "ring-2 ring-offset-1 ring-offset-background",
                          hasHighlights &&
                            highlights.some((h) => h.type === "missed_action") &&
                            "ring-destructive/60",
                          hasHighlights &&
                            !highlights.some((h) => h.type === "missed_action") &&
                            highlights.some((h) => h.type === "red_flag") &&
                            "ring-[hsl(var(--warning))]/60",
                          hasHighlights &&
                            highlights.every(
                              (h) => h.type === "improvement"
                            ) &&
                            "ring-primary/40",
                          hasHighlights &&
                            highlights.some((h) => h.type === "good_move") &&
                            !highlights.some(
                              (h) =>
                                h.type === "missed_action" ||
                                h.type === "red_flag"
                            ) &&
                            "ring-emerald-500/50"
                        )}
                      >
                        {turn.text}
                      </div>
                      {hasHighlights && (
                        <div
                          className={cn(
                            "flex flex-wrap gap-1.5",
                            turn.speaker === "operator"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          {highlights.map((h, i) => (
                            <div
                              key={i}
                              className="flex flex-col gap-0.5 rounded-md border bg-muted/50 px-2 py-1.5 text-left"
                            >
                              <span
                                className={cn(
                                  "text-[10px] font-medium uppercase tracking-wide",
                                  h.type === "missed_action" &&
                                    "text-destructive",
                                  h.type === "red_flag" &&
                                    "text-[hsl(var(--warning))]",
                                  h.type === "improvement" &&
                                    "text-primary",
                                  h.type === "good_move" &&
                                    "text-emerald-600 dark:text-emerald-400"
                                )}
                              >
                                {h.type === "missed_action" && "Missed"}
                                {h.type === "red_flag" && "Red flag"}
                                {h.type === "improvement" && "Improvement"}
                                {h.type === "good_move" && "Good move"}
                              </span>
                              <span className="text-xs font-medium text-foreground">
                                {h.label}
                              </span>
                              {h.detail && (
                                <span className="text-[10px] leading-snug text-muted-foreground">
                                  {h.detail}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
