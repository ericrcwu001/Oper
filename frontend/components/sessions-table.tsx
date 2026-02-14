"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { Session } from "@/lib/types"

interface SessionsTableProps {
  sessions: Session[]
  selectedId: string | null
  onSelect: (session: Session) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

function scoreColor(score: number) {
  if (score >= 90) return "text-accent"
  if (score >= 75) return "text-[hsl(var(--warning))]"
  return "text-destructive"
}

function scoreBadge(score: number) {
  if (score >= 90) return "border-accent/30 bg-accent/10 text-accent"
  if (score >= 75) return "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]"
  return "border-destructive/30 bg-destructive/10 text-destructive"
}

export function SessionsTable({
  sessions,
  selectedId,
  onSelect,
}: SessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No sessions match your filters.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Scenario</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>Language</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow
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
                "cursor-pointer transition-colors",
                selectedId === session.id && "bg-primary/5"
              )}
            >
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {formatDate(session.startedAt)}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {session.scenarioTitle}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs capitalize">
                  {session.difficulty}
                </Badge>
              </TableCell>
              <TableCell className="text-xs uppercase text-muted-foreground">
                {session.language}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-xs font-semibold",
                    scoreBadge(session.evaluation.overallScore)
                  )}
                >
                  {session.evaluation.overallScore}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDuration(session.durationSec)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
