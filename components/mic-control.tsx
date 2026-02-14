"use client"

import { useState } from "react"
import { Mic, MicOff, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface MicControlProps {
  disabled?: boolean
}

export function MicControl({ disabled }: MicControlProps) {
  const [ptt, setPtt] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const active = ptt || handsFree

  // Mock input level
  const level = active ? 65 : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          disabled={disabled || handsFree}
          onMouseDown={() => setPtt(true)}
          onMouseUp={() => setPtt(false)}
          onMouseLeave={() => setPtt(false)}
          className="gap-2"
          aria-label="Push to talk"
        >
          {active ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
          {handsFree ? "Listening" : "Push to Talk"}
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            id="hands-free"
            checked={handsFree}
            onCheckedChange={setHandsFree}
            disabled={disabled}
            aria-label="Toggle hands-free mode"
          />
          <Label htmlFor="hands-free" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Hand className="h-3 w-3" />
            Hands-free
          </Label>
        </div>
      </div>
      {/* Mock input level meter */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Level
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-150",
              active ? "bg-accent" : "bg-muted-foreground/30"
            )}
            style={{ width: `${level}%` }}
          />
        </div>
      </div>
    </div>
  )
}
