"use client"

import { useState, useMemo } from "react"
import { AppShell } from "@/components/app-shell"
import { SessionsTable } from "@/components/sessions-table"
import { SessionDetailDrawer } from "@/components/session-detail-drawer"
import { ChartsPanel } from "@/components/charts-panel"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { pastSessions } from "@/lib/mock-data"
import type { Session, ScenarioType, Difficulty } from "@/lib/types"
import { Download, TableProperties, BarChart3, Filter } from "lucide-react"

export default function DashboardPage() {
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Filters
  const [filterScenario, setFilterScenario] = useState<string>("all")
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all")
  const [scoreRange, setScoreRange] = useState<number[]>([0, 100])

  const filteredSessions = useMemo(() => {
    return pastSessions.filter((s) => {
      if (filterScenario !== "all" && s.scenarioType !== filterScenario) return false
      if (filterDifficulty !== "all" && s.difficulty !== filterDifficulty) return false
      const score = s.evaluation.overallScore
      if (score < scoreRange[0] || score > scoreRange[1]) return false
      return true
    })
  }, [filterScenario, filterDifficulty, scoreRange])

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session)
    setDrawerOpen(true)
  }

  // Summary stats
  const avgScore =
    filteredSessions.length > 0
      ? Math.round(
          filteredSessions.reduce(
            (sum, s) => sum + s.evaluation.overallScore,
            0
          ) / filteredSessions.length
        )
      : 0
  const totalSessions = filteredSessions.length
  const bestScore =
    filteredSessions.length > 0
      ? Math.max(...filteredSessions.map((s) => s.evaluation.overallScore))
      : 0

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">
              Review past sessions, track progress, and analyze performance.
            </p>
          </div>
          <Button variant="outline" className="gap-2 self-start">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="border bg-card">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Sessions</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                {totalSessions}
              </p>
            </CardContent>
          </Card>
          <Card className="border bg-card">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Average Score</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
                {avgScore}
              </p>
            </CardContent>
          </Card>
          <Card className="border bg-card">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Best Score</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-accent">
                {bestScore}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Scenario
                </Label>
                <Select
                  value={filterScenario}
                  onValueChange={setFilterScenario}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scenarios</SelectItem>
                    <SelectItem value="cardiac-arrest">
                      Cardiac Arrest
                    </SelectItem>
                    <SelectItem value="fire">Structure Fire</SelectItem>
                    <SelectItem value="traffic-accident">
                      Traffic Accident
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Difficulty
                </Label>
                <Select
                  value={filterDifficulty}
                  onValueChange={setFilterDifficulty}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Score Range: {scoreRange[0]} - {scoreRange[1]}
                </Label>
                <Slider
                  value={scoreRange}
                  onValueChange={setScoreRange}
                  min={0}
                  max={100}
                  step={5}
                  className="w-48"
                  aria-label="Score range filter"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Sessions / Analytics */}
        <Tabs defaultValue="sessions" className="gap-4">
          <TabsList>
            <TabsTrigger value="sessions" className="gap-2">
              <TableProperties className="h-4 w-4" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
            <Card className="border bg-card">
              <CardContent className="p-0">
                <SessionsTable
                  sessions={filteredSessions}
                  selectedId={selectedSession?.id || null}
                  onSelect={handleSelectSession}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <ChartsPanel sessions={filteredSessions} />
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
