"use client"

import { useState, use } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { ScoreCard } from "@/components/score-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
} from "lucide-react"
import { scenarios, callerScripts } from "@/lib/mock-data"
import type { TranscriptTurn, Evaluation } from "@/lib/types"
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

export default function ReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const searchParams = useSearchParams()
  const scenarioId = searchParams.get("scenario") || "scenario-1"
  const scenario = scenarios.find((s) => s.id === scenarioId) || scenarios[0]

  const [evaluation] = useState<Evaluation>(generateEvaluation)
  const [reviewTranscript] = useState<TranscriptTurn[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = sessionStorage.getItem(`simulation-transcript-${sessionId}`)
        if (raw) {
          const parsed = JSON.parse(raw) as TranscriptTurn[]
          if (Array.isArray(parsed)) return parsed
        }
      }
    } catch {
      // ignore
    }
    return generateReviewTranscript(scenario.scenarioType)
  })
  const [summary, setSummary] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredTranscript = searchQuery
    ? reviewTranscript.filter((t) =>
        t.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : reviewTranscript

  const handleSubmit = () => {
    setSubmitted(true)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
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
              <Link href={`/simulation/${sessionId}?scenario=${scenarioId}`}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link href="/simulation">
                <Plus className="h-4 w-4" />
                New Scenario
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
              </CardContent>
            </Card>

            {/* Operator Summary */}
            <Card className="border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Operator Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="rounded-lg border bg-accent/5 p-4 text-sm text-foreground">
                    <p className="mb-1 text-xs font-medium text-accent">
                      Submitted
                    </p>
                    {summary}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Textarea
                      placeholder="Write your summary of the call, key decisions made, and any observations..."
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      className="min-h-[120px] text-sm"
                    />
                    <Button
                      onClick={handleSubmit}
                      disabled={!summary.trim()}
                      className="w-full"
                    >
                      Submit Summary
                    </Button>
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
                  const isMissedMoment = evaluation.missedActions.some(
                    (action) =>
                      turn.text.toLowerCase().includes("address") &&
                      action.toLowerCase().includes("callback")
                  )
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
                        {isMissedMoment && (
                          <Badge
                            variant="destructive"
                            className="text-[10px]"
                          >
                            Missed moment
                          </Badge>
                        )}
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
                            "ring-2 ring-primary/50"
                        )}
                      >
                        {turn.text}
                      </div>
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
