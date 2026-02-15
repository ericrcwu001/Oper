"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, MicOff, Hand, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface MicControlProps {
  disabled?: boolean
  /** Called with the recorded audio blob when the user finishes speaking (PTT release or hands-free stop). */
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
  const [ptt, setPtt] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const MIN_RECORDING_MS = 500

  const active = ptt || handsFree

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    recorder.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLevel(0)
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

      // Simple level meter: use AudioContext + AnalyserNode (optional, can be noisy)
      try {
        const ac = new AudioContext()
        const source = ac.createMediaStreamSource(stream)
        const analyser = ac.createAnalyser()
        analyser.fftSize = 256
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

  const handlePtTDown = () => {
    if (handsFree) return
    setPtt(true)
    startRecording()
  }

  const handlePtTUp = () => {
    setPtt(false)
    if (!handsFree) stopRecording()
  }

  const handleHandsFreeChange = (checked: boolean) => {
    if (checked) {
      setHandsFree(true)
      startRecording()
    } else {
      setHandsFree(false)
      stopRecording()
    }
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-3")}>
      <div className={cn("flex items-center flex-wrap", compact ? "gap-2" : "gap-3")}>
        <Button
          variant={active ? "default" : "outline"}
          size={compact ? "icon" : "sm"}
          disabled={disabled || sending}
          onMouseDown={handlePtTDown}
          onMouseUp={handlePtTUp}
          onMouseLeave={handlePtTUp}
          onTouchStart={(e) => {
            e.preventDefault()
            handlePtTDown()
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            handlePtTUp()
          }}
          className={cn("touch-none select-none", compact ? "h-8 w-8" : "gap-2")}
          aria-label={sending ? "Sending" : active ? "Listening" : "Push to talk"}
          title={sending ? "Sending..." : handsFree ? "Listening" : "Push to Talk"}
        >
          {sending ? (
            <Loader2 className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "animate-spin")} />
          ) : active ? (
            <Mic className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          ) : (
            <MicOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          )}
          {!compact && (
            sending ? "Sending..." : handsFree ? "Listening" : "Push to Talk"
          )}
        </Button>
        <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2")}>
          <Switch
            id="hands-free"
            checked={handsFree}
            onCheckedChange={handleHandsFreeChange}
            disabled={disabled || sending}
            aria-label="Toggle hands-free mode"
          />
          <Label
            htmlFor="hands-free"
            className={cn("flex items-center text-muted-foreground", compact ? "gap-1 text-[10px]" : "gap-1 text-xs")}
          >
            <Hand className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            Hands-free
          </Label>
        </div>
      </div>
      {error && (
        <p className={cn("text-destructive", compact ? "text-[10px]" : "text-xs")}>{error}</p>
      )}
      <div className={cn("flex items-center min-w-0", compact ? "gap-1.5" : "gap-2")}>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
          Level
        </span>
        <div className="h-1 flex-1 min-w-0 overflow-hidden rounded-full bg-secondary">
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
