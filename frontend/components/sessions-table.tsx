"use client"

import { cn } from "@/lib/utils"
import type { Session } from "@/lib/types"

interface SessionsTableProps {
  sessions: Session[]
  selectedId: string | null
  onSelect: (session: Session) => void
}

// Compact, no-wrap: "14 Feb 14:32" or "Feb 14 14:32"
function formatLogDate(iso: string) {
  const d = new Date(iso)
  const day = d.getDate()
  const mon = d.toLocaleDateString("en-US", { month: "short" })
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  return `${day} ${mon} ${time}`
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function scoreColor(score: number) {
  if (score >= 90) return "text-accent"
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-[hsl(var(--warning))]"
  return "text-destructive"
}

function difficultyTintClass(difficulty: string) {
  if (difficulty === "easy") return "difficulty-tint-easy"
  if (difficulty === "medium") return "difficulty-tint-medium"
  return "difficulty-tint-hard"
}

export function SessionsTable({
  sessions,
  selectedId,
  onSelect,
}: SessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No sessions yet.</p>
      </div>
    )
  }

  // Time column uses minmax so it gets more space on wider screens
  const gridCols = "minmax(6rem, 14rem) 1fr 4.5rem 3rem 3rem"

  return (
    <div className="font-mono text-xs">
      {/* Header row: same grid as data rows so columns align */}
      <div
        className="sessions-log-header grid gap-x-2 px-3 py-2 text-foreground"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span className="truncate">Time</span>
        <span className="min-w-0 truncate">Scenario</span>
        <span className="truncate text-right">Diff</span>
        <span className="truncate text-right">Score</span>
        <span className="truncate text-right">Dur</span>
      </div>
      {/* Data rows: one grid per row so layout stays horizontal at any width */}
      {sessions.map((session) => (
        <div
          key={session.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(session)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelect(session)
            }
          }}
          className={cn(
            "grid cursor-pointer gap-x-2 border-b border-border px-3 py-2 transition-colors hover:bg-muted/50",
            selectedId === session.id && "bg-primary/10"
          )}
          style={{ gridTemplateColumns: gridCols }}
        >
          <span className="truncate whitespace-nowrap text-muted-foreground tabular-nums">
            {formatLogDate(session.startedAt)}
          </span>
          <span className="min-w-0 truncate text-foreground">
            {session.scenarioTitle}
          </span>
          <span
            className={cn(
              "truncate text-right capitalize rounded pl-2 pr-1.5 py-0.5 w-fit justify-self-end text-foreground",
              difficultyTintClass(session.difficulty)
            )}
          >
            {session.difficulty}
          </span>
          <span
            className={cn(
              "truncate text-right font-semibold tabular-nums",
              scoreColor(session.evaluation.overallScore)
            )}
          >
            {session.evaluation.overallScore}
          </span>
          <span className="truncate text-right text-muted-foreground tabular-nums">
            {formatDuration(session.durationSec)}
          </span>
        </div>
      ))}
    </div>
  )
}
