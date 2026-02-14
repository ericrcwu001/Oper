"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { TranscriptTurn } from "@/lib/types"

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

interface TranscriptFeedProps {
  turns: TranscriptTurn[]
  partialText?: string
}

export function TranscriptFeed({ turns, partialText }: TranscriptFeedProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, partialText])

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {turns.length === 0 && !partialText && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Call not started. Press Start Call to begin.
          </div>
        )}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "flex flex-col gap-1",
              turn.speaker === "operator" ? "items-end" : "items-start"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(turn.timestamp)}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  turn.speaker === "caller"
                    ? "text-[hsl(var(--warning))]"
                    : "text-primary"
                )}
              >
                {turn.speaker === "caller" ? "Caller (AI)" : "Operator (You)"}
              </span>
            </div>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                turn.speaker === "operator"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
                turn.isPartial && "italic text-muted-foreground"
              )}
            >
              {turn.text}
            </div>
          </div>
        ))}
        {partialText && (
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-medium text-[hsl(var(--warning))]">
              Caller (AI)
            </span>
            <div className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm italic text-muted-foreground">
              {partialText}
              <span className="ml-1 inline-block animate-pulse">...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  )
}
