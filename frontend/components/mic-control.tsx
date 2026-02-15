"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, MicOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MicControlProps {
  disabled?: boolean
  /** Called with the recorded audio blob when the user turns the mic off (toggle off). */
  onRecordingComplete?: (blob: Blob) => void
  /** When true, show a loading state (e.g. while backend is processing voice). */
  sending?: boolean
  /** When true, reduce padding and gaps for a tighter layout. */
  compact?: boolean
}

export function MicControl({
  disabled,
  onRecordingComplete,
  sending = false,
  compact = false,
}: MicControlProps) {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const MIN_RECORDING_MS = 500

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLevel(0)
    setListening(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (disabled || sending) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const duration = Date.now() - startTimeRef.current
        if (chunksRef.current.length === 0 || duration < MIN_RECORDING_MS) return
        const blob = new Blob(chunksRef.current, { type: mimeType })
        onRecordingComplete?.(blob)
      }
      recorder.onerror = () => setError("Recording failed")

      startTimeRef.current = Date.now()
      recorder.start(100)
      recorderRef.current = recorder
      setListening(true)

      try {
        const ac = new AudioContext()
        if (ac.state === "suspended") {
          await ac.resume()
        }
        const source = ac.createMediaStreamSource(stream)
        const analyser = ac.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.6
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)

        const tick = () => {
          if (recorderRef.current?.state !== "recording") return
          analyser.getByteFrequencyData(data)
          const avg = data.reduce((a, b) => a + b, 0) / data.length
          setLevel(Math.min(100, Math.round((avg / 128) * 100)))
          requestAnimationFrame(tick)
        }
        tick()
      } catch {
        setLevel(50)
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Microphone access denied"
      )
    }
  }, [disabled, sending, onRecordingComplete])

  const handleToggle = () => {
    if (sending) return
    if (listening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const active = listening

  return (
    <div
      className={cn(
        compact
          ? "flex items-center gap-1.5 min-w-0 flex-1 flex-nowrap"
          : "flex flex-col gap-3"
      )}
    >
      <div className={cn("flex items-center", compact ? "gap-1 shrink-0" : "flex-wrap gap-3")}>
        <Button
          variant={active ? "default" : "outline"}
          size={compact ? "icon" : "sm"}
          disabled={disabled || sending}
          onClick={handleToggle}
          className={cn("touch-none select-none", compact ? "h-8 w-8 shrink-0" : "gap-2")}
          aria-label={sending ? "Sending" : active ? "Mic on (click to stop)" : "Mic off (click to talk)"}
          title={sending ? "Sending..." : active ? "Stop" : "Talk"}
        >
          {sending ? (
            <Loader2 className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "animate-spin")} />
          ) : active ? (
            <Mic className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          ) : (
            <MicOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          )}
          {!compact && (
            sending ? "Sending..." : active ? "Stop" : "Talk"
          )}
        </Button>
      </div>
      {error && (
        <p className={cn("text-destructive shrink-0", compact ? "text-[10px]" : "text-xs")}>{error}</p>
      )}
      <div
        className={cn(
          "flex items-center min-w-0",
          compact ? "gap-1 flex-1 min-w-[48px]" : "gap-2 flex-1"
        )}
      >
        <span
          className="uppercase tracking-wide shrink-0 font-normal text-muted-foreground"
          style={{ fontSize: compact ? 8 : 9, opacity: 0.65 }}
        >
          Level
        </span>
        <div className={cn("flex-1 min-w-0 overflow-hidden rounded-full bg-secondary", compact ? "h-1 max-w-[72px]" : "h-1.5 max-w-[120px]")}>
          <div
            className={cn(
              "h-full min-w-0 rounded-full transition-all duration-75",
              active ? "bg-accent" : "bg-muted-foreground/30"
            )}
            style={{ width: `${level}%` }}
          />
        </div>
      </div>
    </div>
  )
}
