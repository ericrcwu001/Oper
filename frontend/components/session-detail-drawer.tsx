"use client"

import { useRouter } from "next/navigation"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useSidebarTabs } from "@/context/sidebar-tabs-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Shield,
  Clock,
  Target,
  Award,
  AlertTriangle,
  StickyNote,
  ExternalLink,
} from "lucide-react"
import type { Session } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SessionDetailDrawerProps {
  session: Session | null
  open: boolean
  onClose: () => void
}

function ScoreBadge({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color =
    score >= 90
      ? "text-accent"
      : score >= 75
        ? "text-emerald-600 dark:text-emerald-400"
        : score >= 50
          ? "text-[hsl(var(--warning))]"
          : "text-destructive"
  return (
    <div className="flex items-center justify-between border border-border bg-muted/50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3 w-3", color)} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <span className={cn("font-mono text-sm font-medium tabular-nums", color)}>{score}</span>
    </div>
  )
}

export function SessionDetailDrawer({
  session,
  open,
  onClose,
}: SessionDetailDrawerProps) {
  const router = useRouter()
  const { addTab } = useSidebarTabs()
  if (!session) return null

  const reviewHref = `/simulation/${session.id}/review?scenario=${session.scenarioId}`

  const handleViewReview = () => {
    addTab({
      id: `feedback-${session.id}`,
      label: session.scenarioTitle,
      href: reviewHref,
      type: "feedback",
    })
    onClose()
    router.push(reviewHref)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full border-l border-border bg-card sm:max-w-lg">
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            {session.scenarioTitle}
            <Badge variant="outline" className="text-[10px] capitalize border-border">
              {session.difficulty}
            </Badge>
          </SheetTitle>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5 border-border text-xs"
            onClick={handleViewReview}
          >
            <ExternalLink className="h-3 w-3" />
            View full review
          </Button>
        </SheetHeader>

        <ScrollArea className="mt-3 h-[calc(100vh-120px)] pr-2">
          <div className="flex flex-col gap-4 pb-6">
            {/* Scores */}
            <div className="flex flex-col gap-1.5">
              <h3 className="border-l-2 border-primary pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Scores
              </h3>
              <ScoreBadge label="Protocol" score={session.evaluation.protocolAdherence} icon={Shield} />
              <ScoreBadge label="Timeliness" score={session.evaluation.timeliness} icon={Clock} />
              <ScoreBadge label="Critical Info" score={session.evaluation.criticalInfoCapture} icon={Target} />
              <ScoreBadge label="Overall" score={session.evaluation.overallScore} icon={Award} />
            </div>

            <Separator />

            {/* Missed Actions */}
            <div className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 border-l-2 border-destructive pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                Missed Actions
              </h3>
              {session.evaluation.missedActions.length === 0 ? (
                <p className="text-xs text-muted-foreground">None - great job!</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {session.evaluation.missedActions.map((a, i) => (
                    <li
                      key={i}
                      className="border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-foreground"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator className="bg-border" />

            {/* Operator notes */}
            <div className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 border-l-2 border-primary pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3 w-3" />
                Operator notes
              </h3>
              <div className="whitespace-pre-wrap border border-border bg-muted/50 px-2 py-1.5 text-xs text-foreground leading-relaxed">
                {session.notes || "No notes recorded."}
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Transcript */}
            <div className="flex flex-col gap-1.5">
              <h3 className="border-l-2 border-primary pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Transcript
              </h3>
              <div className="flex flex-col gap-2">
                {session.transcript.map((turn) => (
                  <div
                    key={turn.id}
                    className={cn(
                      "flex flex-col gap-0.5",
                      turn.speaker === "operator" ? "items-end" : "items-start"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        turn.speaker === "caller"
                          ? "text-[hsl(var(--warning))]"
                          : "text-primary"
                      )}
                    >
                      {turn.speaker === "caller" ? "Caller" : "Operator"}
                    </span>
                    <div
                      className={cn(
                        "max-w-[90%] border px-2 py-1.5 text-xs leading-relaxed",
                        turn.speaker === "operator"
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-muted/50 text-foreground"
                      )}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
