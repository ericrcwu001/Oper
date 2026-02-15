"use client"

import { useState, useEffect } from "react"
import { AppShell } from "@/components/app-shell"
import { SessionsTable } from "@/components/sessions-table"
import { SessionDetailDrawer } from "@/components/session-detail-drawer"
import { ChartsPanel } from "@/components/charts-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSimulations, simulationToSession } from "@/lib/supabase/simulations"
import type { Session } from "@/lib/types"
import { TableProperties, BarChart3, Plus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useSidebarTabs } from "@/context/sidebar-tabs-context"

const DASHBOARD_CACHE_KEY = "dashboard-sessions"
const DASHBOARD_CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

function readSessionsCache(): Session[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw) as { at?: number; data?: Session[] }
    if (!Array.isArray(data) || !data.length) return null
    if (typeof at === "number" && Date.now() - at > DASHBOARD_CACHE_MAX_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

function writeSessionsCache(sessions: Session[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({ at: Date.now(), data: sessions })
    )
  } catch {
    // ignore
  }
}

export default function DashboardPage() {
  const { setNewCallModalOpen, activeCall } = useSidebarTabs()
  // Initialize with empty array so server and client render the same (avoids hydration mismatch).
  // Cache is applied in useEffect after mount.
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setLoadError(null)
    const cached = readSessionsCache()
    if (cached?.length) {
      setSessions(cached)
      setSessionsLoading(false)
    }
    getSimulations()
      .then(({ data, error }) => {
        setSessionsLoading(false)
        if (error) {
          setLoadError(error.message)
          setSessions([])
          return
        }
        const list = data.map(simulationToSession)
        setSessions(list)
        writeSessionsCache(list)
      })
      .catch((err) => {
        setSessionsLoading(false)
        setLoadError(err instanceof Error ? err.message : "Failed to load sessions")
        setSessions([])
      })
  }, [])

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session)
    setDrawerOpen(true)
  }

  // Summary stats (from Supabase simulation data)
  const totalSessions = sessions.length
  const avgScore =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + s.evaluation.overallScore, 0) /
            totalSessions
        )
      : 0
  const bestScore =
    totalSessions > 0
      ? Math.max(...sessions.map((s) => s.evaluation.overallScore))
      : 0
  const avgProtocol =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + s.evaluation.protocolAdherence, 0) /
            totalSessions
        )
      : 0
  const avgTimeliness =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + s.evaluation.timeliness, 0) /
            totalSessions
        )
      : 0
  const avgCriticalInfo =
    totalSessions > 0
      ? Math.round(
          sessions.reduce(
            (sum, s) => sum + s.evaluation.criticalInfoCapture,
            0
          ) / totalSessions
        )
      : 0
  const totalPracticeMinutes =
    totalSessions > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / 60
        )
      : 0

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl pl-14 pr-4 py-10 lg:pl-16 lg:pr-6">
        {/* Header + New call (top right) — always visible for instant load */}
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            Dashboard
          </h1>
          <Button
            size="sm"
            disabled={!!activeCall}
            title={activeCall ? "End the current call first" : undefined}
            className="gap-1.5 border border-white/50 bg-white/10 text-white hover:!bg-white hover:!border-white hover:!text-black disabled:opacity-50 disabled:pointer-events-none"
            onClick={() => !activeCall && setNewCallModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New call
          </Button>
        </div>

        {loadError && (
          <div className="mb-4 border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            [ERR] {loadError}
          </div>
        )}

        {/* Summary stats — data blocks */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card className="border border-border bg-card">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Sessions</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-foreground">
                {totalSessions}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-primary/30 bg-card">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Average Score</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-primary">
                {avgScore}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-accent/30 bg-card">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Best Score</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-accent">
                {bestScore}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg. Protocol</p>
              <p className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                {avgProtocol}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg. Timeliness</p>
              <p className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                {avgTimeliness}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg. Critical Info</p>
              <p className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                {avgCriticalInfo}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Practice</p>
              <p className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                {totalPracticeMinutes} min
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Sessions / Analytics */}
        <Tabs defaultValue="sessions" className="gap-3">
          <TabsList className="h-8 border border-border bg-card p-0.5">
            <TabsTrigger value="sessions" className="gap-1.5 px-3 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <TableProperties className="h-3.5 w-3.5" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 px-3 text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
            <Card className="border bg-card">
              <CardContent className="p-0">
                {sessionsLoading && sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-40 w-full max-w-md rounded" />
                    <p className="text-xs">Loading sessions…</p>
                  </div>
                ) : (
                  <SessionsTable
                    sessions={sessions}
                    selectedId={selectedSession?.id || null}
                    onSelect={handleSelectSession}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <ChartsPanel sessions={sessions} />
          </TabsContent>
        </Tabs>
      </div>

      <SessionDetailDrawer
        session={selectedSession}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </AppShell>
  )
}
