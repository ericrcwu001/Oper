"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  MapPin,
  User,
  AlertTriangle,
  Truck,
  Flame,
} from "lucide-react"
import type { NoteEntry } from "@/lib/types"

const quickTags = [
  { tag: "Location", icon: MapPin },
  { tag: "Caller Name", icon: User },
  { tag: "Injuries", icon: AlertTriangle },
  { tag: "Hazards", icon: Flame },
  { tag: "Units Dispatched", icon: Truck },
]

interface NotesPanelProps {
  callSeconds: number
}

function formatTs(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function NotesPanel({ callSeconds }: NotesPanelProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [input, setInput] = useState("")
  const [activeTag, setActiveTag] = useState<string | undefined>()

  const addNote = () => {
    if (!input.trim()) return
    const entry: NoteEntry = {
      id: `n-${Date.now()}`,
      timestamp: callSeconds,
      text: input.trim(),
      tag: activeTag,
    }
    setNotes((prev) => [...prev, entry])
    setInput("")
    setActiveTag(undefined)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        <p className="text-xs text-muted-foreground">
          Tag and timestamp important info
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4">
          {notes.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No notes yet. Add notes as you gather information.
            </p>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-md border bg-muted/50 px-3 py-2 text-sm"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatTs(n.timestamp)}
                </span>
                {n.tag && (
                  <Badge variant="outline" className="text-[10px]">
                    {n.tag}
                  </Badge>
                )}
              </div>
              <p className="text-foreground">{n.text}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickTags.map((qt) => (
            <Button
              key={qt.tag}
              variant={activeTag === qt.tag ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() =>
                setActiveTag(activeTag === qt.tag ? undefined : qt.tag)
              }
            >
              <qt.icon className="h-3 w-3" />
              {qt.tag}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a note..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                addNote()
              }
            }}
            className="min-h-[60px] resize-none text-sm"
          />
        </div>
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={addNote}
          disabled={!input.trim()}
        >
          Add Note
        </Button>
      </div>
    </div>
  )
}
