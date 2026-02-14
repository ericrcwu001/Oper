"use client"

import { motion, AnimatePresence } from "framer-motion"
import { StatusIndicator } from "./status-indicator"
import { AudioControl } from "@/components/audio-control"
import { MicControl } from "@/components/mic-control"
import { NotesPanel } from "@/components/notes-panel"
import type { NoteEntry } from "@/lib/types"

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

interface RowProps {
  label: string
  value: React.ReactNode
}

function Row({ label, value }: RowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2.5 text-xs last:border-0">
      <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}

interface IntelligencePanelProps {
  scenarioTitle: string
  callerSummary: string
  connectionStatus: "connected" | "connecting" | "disconnected"
  callSeconds: number
  latency: number
  callActive: boolean
  apiLoading: boolean
  callerAudioUrl: string | null
  onVoiceRecordingComplete: (blob: Blob) => void
  currentHint: string
  hintsEnabled: boolean
  noScenario?: boolean
  notes?: NoteEntry[]
  onAddNote?: (entry: NoteEntry) => void
}

export function IntelligencePanel({
  scenarioTitle,
  callerSummary,
  connectionStatus,
  callSeconds,
  latency,
  callActive,
  apiLoading,
  callerAudioUrl,
  onVoiceRecordingComplete,
  currentHint,
  hintsEnabled,
  noScenario,
  notes = [],
  onAddNote,
}: IntelligencePanelProps) {
  const status: "idle" | "connecting" | "connected" | "recording" | "thinking" | "error" =
    !callActive
      ? "idle"
      : connectionStatus === "connecting"
        ? "connecting"
        : apiLoading
          ? "thinking"
          : "connected"

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-background/50">
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Intelligence
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto px-4 py-3">
        {noScenario ? (
          <p className="text-xs text-muted-foreground">
            No scenario in session. Start from setup.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">{scenarioTitle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{callerSummary}</p>
            </div>
            <Row
              label="Status"
              value={
                <StatusIndicator
                  status={status}
                  label={
                    connectionStatus === "connecting"
                      ? "Connecting"
                      : connectionStatus === "connected"
                        ? apiLoading
                          ? "AI responding"
                          : "Live"
                        : "Offline"
                  }
                />
              }
            />
            <Row label="Duration" value={formatTime(callSeconds)} />
            <Row label="Latency" value={latency > 0 ? `${latency}ms` : "—"} />
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 space-y-3 px-4 py-3">
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Caller audio
          </p>
          <AudioControl audioUrl={callerAudioUrl} disabled={!callActive} />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Microphone
          </p>
          <MicControl
            disabled={!callActive}
            onRecordingComplete={onVoiceRecordingComplete}
            sending={apiLoading}
          />
        </div>
      </div>
      {onAddNote && (
        <div className="flex min-h-0 max-h-64 shrink flex-col overflow-hidden border-t border-border/60">
          <NotesPanel
            callSeconds={callSeconds}
            notes={notes}
            onAddNote={onAddNote}
          />
        </div>
      )}
      <AnimatePresence>
        {currentHint && hintsEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/60 bg-primary/5 px-4 py-2.5"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-primary">
              Hint
            </p>
            <p className="mt-0.5 text-xs text-foreground">{currentHint}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
