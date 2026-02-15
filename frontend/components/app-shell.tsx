"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Phone, LayoutDashboard, Radio, PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/simulation", label: "Call", icon: Phone },
]

const SIDEBAR_WIDTH = "12rem" /* 192px — thin rail */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Thin sidebar: no overlay, main content shifts */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-30 flex h-full flex-col border-r border-border/40 bg-background/95 backdrop-blur-sm transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-[var(--sidebar-w)]" : "w-0 overflow-hidden"
        )}
        style={{ "--sidebar-w": SIDEBAR_WIDTH } as React.CSSProperties}
      >
        <div className="flex h-full w-[var(--sidebar-w)] min-w-[var(--sidebar-w)] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/30 px-3 py-3">
            <Link
              href="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex min-w-0 items-center gap-2 text-foreground no-underline"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/90">
                <Radio className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="truncate text-sm font-medium">911Sim</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-2">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-muted/80 text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Trigger when sidebar closed */}
      {!sidebarOpen && (
        <div className="fixed left-3 top-3 z-40">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="h-8 w-8 rounded-lg border border-border/40 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:border-border hover:bg-muted/50 hover:text-foreground"
            aria-label="Open navigation"
          >
            <PanelLeftClose className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      )}

      {/* Main content shifts right when sidebar open — no darkening */}
      <main
        className="flex-1 transition-[margin-left] duration-200 ease-out"
        style={{
          marginLeft: sidebarOpen ? SIDEBAR_WIDTH : 0,
        }}
      >
        {children}
      </main>
    </div>
  )
}
