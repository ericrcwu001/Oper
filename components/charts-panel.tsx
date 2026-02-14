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
        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scoreData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(220 15% 18%)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "hsl(220 10% 55%)", fontSize: 12 }}
                  axisLine={{ stroke: "hsl(220 15% 18%)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "hsl(220 10% 55%)", fontSize: 12 }}
                  axisLine={{ stroke: "hsl(220 15% 18%)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220 20% 10%)",
                    border: "1px solid hsl(220 15% 18%)",
                    borderRadius: "8px",
                    color: "hsl(220 10% 93%)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(210 100% 55%)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "hsl(210 100% 55%)" }}
                  name="Overall"
                />
                <Line
                  type="monotone"
                  dataKey="protocol"
                  stroke="hsl(160 70% 42%)"
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
        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Missed Actions Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            {missedData.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                No missed actions recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={missedData} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(220 15% 18%)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "hsl(220 10% 55%)", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(220 15% 18%)" }}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={160}
                    tick={{ fill: "hsl(220 10% 55%)", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(220 15% 18%)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220 20% 10%)",
                      border: "1px solid hsl(220 15% 18%)",
                      borderRadius: "8px",
                      color: "hsl(220 10% 93%)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(0 72% 51%)"
                    radius={[0, 4, 4, 0]}
                    name="Occurrences"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top recurring improvements */}
      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top Recurring Improvements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {topImprovements.map(([feedback, count], i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 rounded-md border bg-muted/50 px-3 py-2"
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
