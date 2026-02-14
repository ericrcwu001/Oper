"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, Flame, Car } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Scenario } from "@/lib/types"

const scenarioIcons: Record<string, React.ElementType> = {
  "cardiac-arrest": Heart,
  fire: Flame,
  "traffic-accident": Car,
}

const scenarioColors: Record<string, string> = {
  "cardiac-arrest": "text-destructive",
  fire: "text-[hsl(var(--warning))]",
  "traffic-accident": "text-primary",
}

interface ScenarioCardProps {
  scenario: Scenario
  selected: boolean
  onSelect: () => void
}

export function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: ScenarioCardProps) {
  const Icon = scenarioIcons[scenario.scenarioType] || Heart

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "cursor-pointer border-2 transition-all hover:border-primary/50",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-transparent"
      )}
    >
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg bg-card",
              scenarioColors[scenario.scenarioType]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="outline" className="text-xs capitalize">
            {scenario.difficulty}
          </Badge>
        </div>
        <h3 className="mb-1 font-semibold text-foreground">
          {scenario.title}
        </h3>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {scenario.description}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {scenario.criticalInfo.slice(0, 3).map((info) => (
            <Badge
              key={info}
              variant="secondary"
              className="text-xs font-normal"
            >
              {info}
            </Badge>
          ))}
          {scenario.criticalInfo.length > 3 && (
            <Badge variant="secondary" className="text-xs font-normal">
              +{scenario.criticalInfo.length - 3} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
