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
}

export function AudioControl({
  audioUrl,
  disabled,
  onPlaybackEnd,
}: AudioControlProps) {
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState([75])
  const audioRef = useRef<HTMLAudioElement>(null)

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
    <div className="flex items-center gap-3">
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
        className="h-8 w-8"
        onClick={handlePlayPause}
        disabled={disabled || !audioUrl}
        aria-label={playing ? "Pause caller audio" : "Play caller audio"}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>
      <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
