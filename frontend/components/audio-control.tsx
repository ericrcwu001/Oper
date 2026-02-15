"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Pause, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface AudioControlProps {
  /** URL of the current caller audio clip (from backend). When set, audio will play. */
  audioUrl?: string | null
  disabled?: boolean
  /** Called when the current audio clip finishes playing. */
  onPlaybackEnd?: () => void
  /** Called on audio timeupdate (throttled ~100ms) for transcript sync. */
  onTimeUpdate?: (currentTime: number, duration: number) => void
  /** When true, use smaller button and slider for a tighter layout. */
  compact?: boolean
}

export function AudioControl({
  audioUrl,
  disabled,
  onPlaybackEnd,
  onTimeUpdate,
  compact = false,
}: AudioControlProps) {
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState([75])
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastTimeUpdateRef = useRef(0)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate

  // When a new audio URL is set, load and play it
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) {
      setPlaying(false)
      return
    }
    audio.src = audioUrl
    audio.volume = volume[0] / 100
    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise.then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      setPlaying(true)
    }
  }, [audioUrl])

  // Sync volume with slider
  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume[0] / 100
  }, [volume])

  // timeupdate handler for transcript sync (throttled ~100ms)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !onTimeUpdate) return
    const handleTimeUpdate = () => {
      const now = performance.now()
      if (now - lastTimeUpdateRef.current < 100) return
      lastTimeUpdateRef.current = now
      onTimeUpdateRef.current?.(audio.currentTime, audio.duration)
    }
    audio.addEventListener("timeupdate", handleTimeUpdate)
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate)
  }, [onTimeUpdate])

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  const handleEnded = () => {
    setPlaying(false)
    onPlaybackEnd?.()
  }

  return (
    <div className={`flex items-center min-w-0 ${compact ? "gap-2" : "gap-3"}`}>
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        className="hidden"
        preload="auto"
      />
      <Button
        variant="outline"
        size="icon"
        className={compact ? "h-7 w-7 shrink-0" : "h-8 w-8"}
        onClick={handlePlayPause}
        disabled={disabled || !audioUrl}
        aria-label={playing ? "Pause caller audio" : "Play caller audio"}
      >
        {playing ? (
          <Pause className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        ) : (
          <Play className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        )}
      </Button>
      <Volume2 className={`shrink-0 text-muted-foreground ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      <Slider
        value={volume}
        onValueChange={setVolume}
        max={100}
        step={1}
        className={compact ? "w-16" : "w-24"}
        disabled={disabled}
        aria-label="Caller audio volume"
      />
      <span className={`font-mono text-muted-foreground shrink-0 ${compact ? "text-[10px]" : "text-xs"}`}>
        {volume[0]}%
      </span>
    </div>
  )
}
