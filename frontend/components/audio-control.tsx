"use client"

import { useState } from "react"
import { Play, Pause, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface AudioControlProps {
  disabled?: boolean
}

export function AudioControl({ disabled }: AudioControlProps) {
  const [playing, setPlaying] = useState(true)
  const [volume, setVolume] = useState([75])

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => setPlaying(!playing)}
        disabled={disabled}
        aria-label={playing ? "Pause caller audio" : "Play caller audio"}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>
      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
      <Slider
        value={volume}
        onValueChange={setVolume}
        max={100}
        step={1}
        className="w-24"
        disabled={disabled}
        aria-label="Caller audio volume"
      />
      <span className="font-mono text-xs text-muted-foreground">
        {volume[0]}%
      </span>
    </div>
  )
}
