"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
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
import type { Difficulty, Language } from "@/lib/types"
import { generateScenario } from "@/lib/api"
import { ArrowRight, Settings2, Loader2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const GENERATED_SCENARIO_STORAGE_KEY = "simulation-generated-scenario"

export default function SimulationSetupPage() {
  const router = useRouter()
  const [difficulty, setDifficulty] = useState<Difficulty>("medium")
  const [language, setLanguage] = useState<Language>("en")
  const [enableHints, setEnableHints] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await generateScenario(difficulty)
      const sessionId = `sim-${Date.now()}`
      sessionStorage.setItem(
        `${GENERATED_SCENARIO_STORAGE_KEY}-${sessionId}`,
        JSON.stringify(payload)
      )
      router.push(
        `/simulation/${sessionId}?scenario=generated&difficulty=${difficulty}&language=${language}&hints=${enableHints}`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate scenario")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl pl-14 pr-4 py-10 lg:pl-16 lg:pr-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Call Setup
          </h1>
          <p className="mt-2 text-muted-foreground">
            Choose the difficulty of call you want to take.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="border bg-card">
              <CardContent className="pt-6">
                <p className="text-muted-foreground">
                  When you start, we'll connect you to a new emergency call (e.g.
                  cardiac arrest, fire, traffic accident, domestic dispute)
                  based on your chosen difficulty. The AI caller will respond as
                  they would during a real call.
                </p>
              </CardContent>
            </Card>
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
                  <Label htmlFor="difficulty">Call Difficulty</Label>
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

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  size="lg"
                  className="mt-2 w-full gap-2"
                  disabled={loading}
                  onClick={handleStart}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating call…
                    </>
                  ) : (
                    <>
                      Start Call
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
