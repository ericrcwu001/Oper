"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSidebarTabs } from "@/context/sidebar-tabs-context"
import { generateScenario } from "@/lib/api"
import type { Difficulty } from "@/lib/types"
import { Loader2, Zap } from "lucide-react"

const GENERATED_SCENARIO_STORAGE_KEY = "simulation-generated-scenario"

export function NewCallModal() {
  const router = useRouter()
  const { newCallModalOpen, setNewCallModalOpen, setActiveCall, activeCall } = useSidebarTabs()
  const [difficulty, setDifficulty] = useState<Difficulty>("medium")
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
      const href = `/simulation/${sessionId}?scenario=generated&difficulty=${difficulty}&language=en&hints=false&autoStart=1`
      setActiveCall(null)
      setNewCallModalOpen(false)
      router.push(href)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate scenario")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={newCallModalOpen && !activeCall}
      onOpenChange={(open) => !activeCall && setNewCallModalOpen(open)}
    >
      <DialogContent className="border-border bg-card p-4 sm:max-w-xs">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-sm font-medium">New call</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase text-muted-foreground">
              Difficulty
            </Label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
            >
              <SelectTrigger className="h-8 border-border text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-xs text-destructive">[ERR] {error}</p>
          )}
          <Button
            size="sm"
            className="w-full gap-1.5 border border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={loading}
            onClick={handleStart}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {loading ? "Connecting…" : "Start call"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
