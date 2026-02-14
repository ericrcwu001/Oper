"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { ScenarioCard } from "@/components/scenario-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { scenarios } from "@/lib/mock-data"
import type { Difficulty, Language } from "@/lib/types"
import { ArrowRight, Settings2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SimulationSetupPage() {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>("medium")
  const [language, setLanguage] = useState<Language>("en")
  const [enableHints, setEnableHints] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    if (!selectedId) return
    setLoading(true)
    // Mock POST to create session
    await new Promise((resolve) => setTimeout(resolve, 600))
    const sessionId = `sim-${Date.now()}`
    router.push(
      `/simulation/${sessionId}?scenario=${selectedId}&difficulty=${difficulty}&language=${language}&hints=${enableHints}`
    )
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Scenario Setup
          </h1>
          <p className="mt-2 text-muted-foreground">
            Choose an emergency scenario and configure your simulation
            settings.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Select Scenario
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  selected={selectedId === s.id}
                  onSelect={() => setSelectedId(s.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <Card className="sticky top-20 border bg-card">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as Difficulty)}
                  >
                    <SelectTrigger id="difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="language">Language</Label>
                  <Select
                    value={language}
                    onValueChange={(v) => setLanguage(v as Language)}
                  >
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2.5">
                  <Label
                    htmlFor="hints"
                    className="text-sm font-normal text-foreground"
                  >
                    Enable real-time hints
                  </Label>
                  <Switch
                    id="hints"
                    checked={enableHints}
                    onCheckedChange={setEnableHints}
                  />
                </div>

                <Button
                  size="lg"
                  className="mt-2 w-full gap-2"
                  disabled={!selectedId || loading}
                  onClick={handleStart}
                >
                  {loading ? "Starting..." : "Start Simulation"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
