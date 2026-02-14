"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { getLiveEvalWsUrl } from "@/lib/api"
import {
  LIVE_EVAL_MSG,
  type RecommendationUpdatePayload,
  type ServerMessage,
} from "@/lib/live-eval-types"

const AUDIO_CHUNK_MS = 250

export function useLiveCallEval() {
  const [connected, setConnected] = useState(false)
  const [transcriptLines, setTranscriptLines] = useState<string[]>([])
  const [partial, setPartial] = useState("")
  const [recommendation, setRecommendation] = useState<RecommendationUpdatePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  const connect = useCallback(() => {
    const url = getLiveEvalWsUrl()
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
    ws.onerror = () => setError("WebSocket error")
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        if (msg.type === LIVE_EVAL_MSG.TRANSCRIPT_DELTA) {
          setPartial(msg.payload.text)
        } else if (msg.type === LIVE_EVAL_MSG.TRANSCRIPT_FINAL) {
          setPartial("")
          setTranscriptLines((prev) => [...prev, msg.payload.text].filter(Boolean))
        } else if (msg.type === LIVE_EVAL_MSG.RECOMMENDATION_UPDATE) {
          setRecommendation(msg.payload)
        } else if (msg.type === LIVE_EVAL_MSG.ERROR) {
          setError(msg.payload.message)
        }
      } catch {
        // ignore
      }
    }
    return () => {
      ws.close()
    }
  }, [])

  const disconnect = useCallback(() => {
    stopMic()
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: LIVE_EVAL_MSG.END_SESSION }))
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setTranscriptLines([])
    setPartial("")
    setRecommendation(null)
  }, [])

  const sendAudioChunk = useCallback((chunk: Blob | ArrayBuffer) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    if (chunk instanceof ArrayBuffer) wsRef.current.send(chunk)
    else wsRef.current.send(chunk)
  }, [])

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) sendAudioChunk(e.data)
      }
      recorder.start(AUDIO_CHUNK_MS)
      recorderRef.current = recorder
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed")
    }
  }, [sendAudioChunk])

  const stopMic = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.stop()
      recorderRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connected,
    transcriptLines,
    partial,
    recommendation,
    error,
    connect,
    disconnect,
    startMic,
    stopMic,
  }
}
