"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { Session } from "@/lib/types"

/* Terminal palette for charts (matches globals.css) */
const CHART = {
  grid: "hsl(222, 12%, 14%)",
  tick: "hsl(120, 4%, 52%)",
  primary: "hsl(168, 100%, 42%)",
  accent: "hsl(135, 100%, 45%)",
  warning: "hsl(42, 100%, 50%)",
  destructive: "hsl(0, 85%, 55%)",
  tooltipBg: "hsl(222, 20%, 6%)",
  tooltipBorder: "hsl(222, 12%, 14%)",
  tooltipText: "hsl(120, 6%, 88%)",
}

interface ChartsPanelProps {
  sessions: Session[]
}

export function ChartsPanel({ sessions }: ChartsPanelProps) {
  // Line chart: overall score over time
  const scoreData = sessions.map((s, i) => ({
    name: `S${i + 1}`,
    score: s.evaluation.overallScore,
    protocol: s.evaluation.protocolAdherence,
    timeliness: s.evaluation.timeliness,
  }))

  // Bar chart: missed actions frequency
  const missedMap: Record<string, number> = {}
  sessions.forEach((s) => {
    s.evaluation.missedActions.forEach((action) => {
      const short = action.length > 30 ? action.substring(0, 30) + "..." : action
      missedMap[short] = (missedMap[short] || 0) + 1
    })
  })
  const missedData = Object.entries(missedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))

  // Top recurring improvements
  const allFeedback = sessions.flatMap((s) => s.evaluation.feedbackBullets)
  const feedbackCount: Record<string, number> = {}
  allFeedback.forEach((fb) => {
    feedbackCount[fb] = (feedbackCount[fb] || 0) + 1
  })
  const topImprovements = Object.entries(feedbackCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score trend */}
        <Card className="border border-border bg-card">
          <CardHeader className="border-b border-border py-2 px-4">
            <CardTitle className="text-xs font-medium">Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART.tick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.grid }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: CHART.tick, fontSize: 11 }}
                  axisLine={{ stroke: CHART.grid }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: CHART.tooltipBg,
                    border: `1px solid ${CHART.tooltipBorder}`,
                    color: CHART.tooltipText,
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART.primary }}
                  name="Overall"
                />
                <Line
                  type="monotone"
                  dataKey="protocol"
                  stroke={CHART.accent}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Protocol"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Missed actions frequency */}
        <Card className="border border-border bg-card">
          <CardHeader className="border-b border-border py-2 px-4">
            <CardTitle className="text-xs font-medium">Missed Actions Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            {missedData.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                No missed actions recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={missedData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: CHART.tick, fontSize: 11 }}
                    axisLine={{ stroke: CHART.grid }}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    tick={{ fill: CHART.tick, fontSize: 10 }}
                    axisLine={{ stroke: CHART.grid }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART.tooltipBg,
                      border: `1px solid ${CHART.tooltipBorder}`,
                      color: CHART.tooltipText,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="count" fill={CHART.destructive} radius={0} name="Occurrences" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top recurring improvements */}
      <Card className="border border-border bg-card">
        <CardHeader className="border-b border-border py-2 px-4">
          <CardTitle className="text-xs font-medium">Top Recurring Improvements</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-col gap-1.5">
            {topImprovements.map(([feedback, count], i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 border border-border bg-muted/50 px-3 py-2"
              >
                <p className="text-sm text-foreground">{feedback}</p>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {count}x
                </span>
              </div>
            ))}
            {topImprovements.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Not enough data yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
