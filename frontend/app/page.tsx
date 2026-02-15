"use client"

import Image from "next/image"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { siteConfig } from "@/lib/site-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Radio } from "lucide-react"

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        router.push("/dashboard")
        router.refresh()
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push("/dashboard")
        router.refresh()
      }
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-2 border-b border-border pb-4">
          {siteConfig.logo === "icon" ? (
            <div className="flex h-10 w-10 items-center justify-center border border-white/40 bg-white/10">
              <Radio className="h-5 w-5 text-white/90" />
            </div>
          ) : (
            <div className="relative h-10 w-10 overflow-hidden">
              <Image
                src={siteConfig.logo}
                alt=""
                fill
                className="object-contain"
                sizes="40px"
              />
            </div>
          )}
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            {siteConfig.siteName}
          </h1>
          <p className="text-center text-xs text-muted-foreground">
            {siteConfig.tagline}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              &gt; email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="border-border bg-background font-mono text-sm placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs text-muted-foreground">
              &gt; password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="border-border bg-background font-mono text-sm placeholder:text-muted-foreground"
            />
          </div>
          {message && (
            <p
              className={`text-xs font-mono ${
                message.type === "error" ? "text-destructive" : "text-accent"
              }`}
            >
              {message.type === "error" ? "[ERR]" : "[OK]"} {message.text}
            </p>
          )}
            <Button
            type="submit"
            className="w-full border border-white/50 bg-white/10 text-white hover:bg-white/20"
            disabled={loading}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Log in" : "Sign up"}
          </Button>
        </form>

        <div className="text-center border-t border-border pt-3">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"))
              setMessage(null)
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Create an account" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  )
}
