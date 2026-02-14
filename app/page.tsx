import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import {
  Radio,
  Phone,
  BarChart3,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Shield,
  Zap,
  Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const steps = [
  {
    icon: Target,
    title: "Generate Scenario",
    description:
      "Choose from realistic emergency scenarios with varying difficulty levels.",
  },
  {
    icon: Phone,
    title: "Live Call",
    description:
      "Handle a simulated 911 call with an AI caller, streaming transcript, and real-time notes.",
  },
  {
    icon: BarChart3,
    title: "Score & Feedback",
    description:
      "Get detailed evaluation on protocol adherence, timeliness, and critical info capture.",
  },
  {
    icon: TrendingUp,
    title: "Track Improvement",
    description:
      "Review past sessions, identify patterns, and measure progress over time.",
  },
]

const features = [
  {
    icon: Radio,
    title: "Realistic Simulation",
    description:
      "AI-powered callers react dynamically to your responses with realistic emotional states.",
  },
  {
    icon: Shield,
    title: "Protocol Training",
    description:
      "Learn and practice standard operating procedures for common emergency types.",
  },
  {
    icon: Zap,
    title: "Instant Feedback",
    description:
      "Get scored immediately after each call with actionable improvement suggestions.",
  },
  {
    icon: MessageSquare,
    title: "Trainer Review",
    description:
      "Supervisors can review transcripts, add comments, and track trainee progress.",
  },
]

export default function Page() {
  return (
    <AppShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(210_100%_55%/0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 lg:px-6 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground">
              <Radio className="h-3.5 w-3.5 text-primary" />
              <span>AI-Powered Training Platform</span>
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Realistic 911 call training powered by AI
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Practice handling emergency calls in a safe, controlled
              environment. Build confidence and improve protocol adherence
              with realistic AI-driven simulations.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild className="gap-2">
                <Link href="/simulation">
                  Start Simulation
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/dashboard">View Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-20 lg:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 text-muted-foreground">
              Four steps from scenario selection to measurable improvement.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <Card key={step.title} className="relative border bg-card">
                <CardContent className="pt-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-2 font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-20 lg:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for mission-critical training
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything trainers and trainees need in one platform.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title} className="border bg-card">
                <CardContent className="flex gap-4 pt-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center lg:px-6">
          <h2 className="text-balance text-2xl font-semibold text-foreground">
            Ready to start training?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Jump into your first simulation and see how you perform.
          </p>
          <Button size="lg" asChild className="mt-8 gap-2">
            <Link href="/simulation">
              Begin Your First Call
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </AppShell>
  )
}
