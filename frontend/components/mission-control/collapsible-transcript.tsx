"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TranscriptTurn } from "@/lib/types"

function formatTs(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Typing effect for a single line of text */
function Typewriter({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const [displayed, setDisplayed] = useState("")
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed("")
  }, [text])

  useEffect(() => {
    if (text.length === 0) return
    const t = setInterval(() => {
      if (indexRef.current >= text.length) {
        clearInterval(t)
        return
      }
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
    }, 10)
    return () => clearInterval(t)
  }, [text])

  return (
    <span className={className}>
      {displayed}
      {indexRef.current < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  )
}

interface CollapsibleTranscriptProps {
  turns: TranscriptTurn[]
  partialText?: string
  defaultCollapsed?: boolean
  className?: string
}

export function CollapsibleTranscript({
  turns,
  partialText,
  defaultCollapsed = false,
  className = "",
}: CollapsibleTranscriptProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [typingTurnId, setTypingTurnId] = useState<string | null>(
    turns.length > 0 ? turns[turns.length - 1].id : null
  )
  const endRef = useRef<HTMLDivElement>(null)

  const lastTurn = turns[turns.length - 1]
  useEffect(() => {
    if (lastTurn) setTypingTurnId(lastTurn.id)
  }, [lastTurn?.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, partialText])

  return (
    <div className={cn("flex flex-col border-t border-border/60 bg-background/80 ", className)}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      >
        <span>Transcript</span>
        <span className="flex items-center gap-1">
          {turns.length} turn{turns.length !== 1 ? "s" : ""}
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-auto px-4 pb-3 pt-1">
              {turns.length === 0 && !partialText && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Call not started.
                </p>
              )}
              {turns.map((turn) => (
                <div
                  key={turn.id}
                  className={cn(
                    "flex flex-col gap-0.5 py-2",
                    turn.speaker === "operator" ? "items-end" : "items-start"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatTs(turn.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase",
                        turn.speaker === "caller"
                          ? "text-warning"
                          : "text-primary"
                      )}
                    >
                      {turn.speaker === "caller" ? "Caller" : "Operator"}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "max-w-[90%] px-2.5 py-1.5 text-sm",
                      turn.speaker === "operator"
                        ? "bg-primary/20 text-primary-foreground"
                        : "bg-muted/50 text-foreground"
                    )}
                  >
                    {typingTurnId === turn.id ? (
                      <Typewriter key={turn.id} text={turn.text} />
                    ) : (
                      turn.text
                    )}
                  </div>
                </div>
              ))}
              {partialText && (
                <div className="flex flex-col items-start gap-0.5 py-2">
                  <span className="text-[10px] font-medium uppercase text-warning">
                    Caller
                  </span>
                  <div className="max-w-[90%] bg-muted/50 px-2.5 py-1.5 text-sm italic text-muted-foreground">
                    {partialText}
                    <span className="ml-0.5 animate-pulse">|</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
