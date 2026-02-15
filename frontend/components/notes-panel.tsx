"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { NoteEntry } from "@/lib/types"

function formatTs(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

interface NotesPanelProps {
  callSeconds: number
  notes: NoteEntry[]
  onAddNote: (entry: NoteEntry) => void
  /** Optional AI-suggested note from latest caller statement; user can add with one click. */
  suggestedNote?: string | null
  /** Called when user adds the suggested note (clears suggestion in parent). */
  onAddSuggestedNote?: (text: string) => void
}

export function NotesPanel({
  callSeconds,
  notes,
  onAddNote,
  suggestedNote,
  onAddSuggestedNote,
}: NotesPanelProps) {
  const [input, setInput] = useState("")

  const addNote = (text: string, fromSuggestion = false) => {
    const trimmed = text.trim()
    if (!trimmed) return
    onAddNote({
      id: `n-${Date.now()}`,
      timestamp: callSeconds,
      text: trimmed,
      fromSuggestion,
    })
    setInput("")
    if (fromSuggestion) {
      onAddSuggestedNote?.(trimmed)
    }
  }

  const handleAddFromInput = () => {
    addNote(input)
  }

  const handleAddSuggestion = () => {
    if (suggestedNote?.trim()) {
      addNote(suggestedNote.trim(), true)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4">
          {notes.length === 0 && !suggestedNote && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No notes yet. Add notes as you gather information.
            </p>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                n.fromSuggestion ? "border-primary/30 bg-primary/5" : "bg-muted/50"
              )}
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTs(n.timestamp)}
              </span>
              <p className="mt-0.5 text-foreground">{n.text}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-4 space-y-2">
        {suggestedNote?.trim() && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full justify-center gap-1.5 text-xs"
            onClick={handleAddSuggestion}
          >
            Add: {suggestedNote.trim()}
          </Button>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Add a note..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddFromInput()
              }
            }}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleAddFromInput}
            disabled={!input.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
