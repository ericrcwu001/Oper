"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ScoreCardProps {
  label: string
  score: number
  icon: React.ElementType
}

function getScoreColor(score: number) {
  if (score >= 90) return "text-accent" // excellent: bright green
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400" // good: positive green
  if (score >= 50) return "text-[hsl(var(--warning))]" // average: amber
  return "text-destructive"
}

function getScoreBg(score: number) {
  if (score >= 90) return "bg-accent/10"
  if (score >= 75) return "bg-emerald-500/10"
  if (score >= 50) return "bg-[hsl(var(--warning)/0.1)]"
  return "bg-destructive/10"
}

export function ScoreCard({ label, score, icon: Icon }: ScoreCardProps) {
  return (
    <Card className="border bg-card">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p
              className={cn(
                "mt-1 text-3xl font-bold tabular-nums",
                getScoreColor(score)
              )}
            >
              {score}
            </p>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              getScoreBg(score)
            )}
          >
            <Icon className={cn("h-5 w-5", getScoreColor(score))} />
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              score >= 90
                ? "bg-accent"
                : score >= 75
                  ? "bg-emerald-500"
                  : score >= 50
                    ? "bg-[hsl(var(--warning))]"
                    : "bg-destructive"
            )}
            style={{ width: `${score}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
