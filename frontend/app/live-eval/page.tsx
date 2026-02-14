"use client"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { useLiveCallEval } from "@/hooks/use-live-call-eval"
import { Mic, MicOff, Wifi, WifiOff, AlertCircle, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

export default function LiveEvalPage() {
  const {
    connected,
    transcriptLines,
    partial,
    recommendation,
    error,
    connect,
    disconnect,
    startMic,
    stopMic,
  } = useLiveCallEval()

  const handleConnect = () => {
    connect()
  }

  const handleStartMic = () => {
    if (connected) startMic()
  }

  const handleDisconnect = () => {
    stopMic()
    disconnect()
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Live Call Evaluation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stream mic audio for real-time transcript and dispatch recommendations (transcript-only; no map/resources).
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!connected ? (
            <Button onClick={handleConnect} className="gap-2">
              <Wifi className="h-4 w-4" />
              Connect
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleStartMic} className="gap-2">
                <Mic className="h-4 w-4" />
                Start mic
              </Button>
              <Button variant="outline" onClick={stopMic} className="gap-2">
                <MicOff className="h-4 w-4" />
                Stop mic
              </Button>
              <Button variant="ghost" onClick={handleDisconnect} className="gap-2 text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                Disconnect
              </Button>
            </>
          )}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {connected ? <Wifi className="h-3.5 w-3.5 text-green-500" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Live transcript</h2>
            <div className="mt-3 max-h-64 overflow-y-auto font-mono text-xs text-muted-foreground">
              {transcriptLines.length === 0 && !partial && (
                <p className="text-muted-foreground/70">Connect and start mic. Final transcript segments appear here.</p>
              )}
              {transcriptLines.map((line, i) => (
                <p key={i} className="mb-1">
                  {line}
                </p>
              ))}
              {partial && <p className="mb-1 text-primary">{partial}</p>}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Shield className="h-4 w-4" />
              Dispatch recommendations
            </h2>
            <div className="mt-3 space-y-2">
              {!recommendation && (
                <p className="text-xs text-muted-foreground">
                  Recommendations update as the transcript is processed (max 1/sec; immediate for critical signals).
                </p>
              )}
              {recommendation && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Severity: <span className={cn("font-medium", severityColor(recommendation.severity))}>{recommendation.severity}</span>
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-xs">
                    {(recommendation.units || []).map((u, i) => (
                      <li key={i}>
                        <span className="font-medium">{u.unit}</span>
                        {u.rationale && <span className="text-muted-foreground"> — {u.rationale}</span>}
                      </li>
                    ))}
                  </ul>
                  {recommendation.rationales && recommendation.rationales.length > 0 && (
                    <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      {recommendation.rationales.map((r, i) => (
                        <p key={i}>{r}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function severityColor(s?: string) {
  switch (s) {
    case "critical":
      return "text-red-500"
    case "high":
      return "text-orange-500"
    case "medium":
      return "text-yellow-500"
    default:
      return "text-muted-foreground"
  }
}
