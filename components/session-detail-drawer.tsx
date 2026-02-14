"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Shield,
  Clock,
  Target,
  Award,
  AlertTriangle,
  StickyNote,
  FileText,
  MessageSquare,
} from "lucide-react"
import type { Session } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SessionDetailDrawerProps {
  session: Session | null
  open: boolean
  onClose: () => void
}

function ScoreBadge({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color = score >= 90 ? "text-accent" : score >= 75 ? "text-[hsl(var(--warning))]" : "text-destructive"
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={cn("font-mono text-sm font-bold", color)}>{score}</span>
    </div>
  )
}

export function SessionDetailDrawer({
  session,
  open,
  onClose,
}: SessionDetailDrawerProps) {
  const [trainerComment, setTrainerComment] = useState("")
  const [commentSaved, setCommentSaved] = useState(false)

  if (!session) return null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            {session.scenarioTitle}
            <Badge variant="outline" className="text-xs capitalize">
              {session.difficulty}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-100px)] pr-2">
          <div className="flex flex-col gap-6 pb-8">
            {/* Scores */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Scores
              </h3>
              <ScoreBadge label="Protocol" score={session.evaluation.protocolAdherence} icon={Shield} />
              <ScoreBadge label="Timeliness" score={session.evaluation.timeliness} icon={Clock} />
              <ScoreBadge label="Critical Info" score={session.evaluation.criticalInfoCapture} icon={Target} />
              <ScoreBadge label="Overall" score={session.evaluation.overallScore} icon={Award} />
            </div>

            <Separator />

            {/* Missed Actions */}
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                Missed Actions
              </h3>
              {session.evaluation.missedActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">None - great job!</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {session.evaluation.missedActions.map((a, i) => (
                    <li
                      key={i}
                      className="rounded-md border bg-destructive/5 px-3 py-2 text-xs text-foreground"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3 w-3" />
                Notes
              </h3>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/50 px-3 py-2 text-xs text-foreground leading-relaxed">
                {session.notes || "No notes recorded."}
              </div>
            </div>

            {/* Operator Summary */}
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3 w-3" />
                Operator Summary
              </h3>
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-foreground leading-relaxed">
                {session.operatorSummary || "No summary submitted."}
              </div>
            </div>

            <Separator />

            {/* Transcript */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                        "max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                        turn.speaker === "operator"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Trainer Comments */}
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                Trainer Comments
              </h3>
              {commentSaved ? (
                <div className="rounded-md border bg-accent/5 px-3 py-2 text-xs text-foreground">
                  <p className="mb-1 text-[10px] font-medium text-accent">Saved</p>
                  {trainerComment}
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Add trainer feedback..."
                    value={trainerComment}
                    onChange={(e) => setTrainerComment(e.target.value)}
                    className="min-h-[80px] text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => setCommentSaved(true)}
                    disabled={!trainerComment.trim()}
                  >
                    Save Comment
                  </Button>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
