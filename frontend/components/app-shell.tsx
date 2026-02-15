"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import { LayoutDashboard, Radio, PanelLeftClose, LogOut, Phone, FileText, Plus, X } from "lucide-react"
import { siteConfig } from "@/lib/site-config"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useSidebarTabs } from "@/context/sidebar-tabs-context"
import type { SidebarTabType } from "@/context/sidebar-tabs-context"
import type { RootState } from "@/store"

const SIDEBAR_WIDTH = "14rem" /* 224px — slightly larger rail */

function tabIcon(type: SidebarTabType) {
  switch (type) {
    case "dashboard":
      return LayoutDashboard
    case "call":
      return Phone
    case "feedback":
      return FileText
    default:
      return LayoutDashboard
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { tabs, removeTab, setNewCallModalOpen } = useSidebarTabs()
  const callState = useSelector((s: RootState) => s.call)
  const activeCall = useMemo(
    () =>
      callState.callActive && callState.sessionId
        ? {
            sessionId: callState.sessionId,
            label: callState.label,
            href: callState.href,
          }
        : null,
    [callState.callActive, callState.sessionId, callState.label, callState.href]
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = () => {
    if (loggingOut) return
    setLoggingOut(true)
    const supabase = createClient()
    supabase.auth.signOut().catch(() => {})
    setTimeout(() => {
      window.location.href = "/"
    }, 400)
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: string, href: string) => {
    e.preventDefault()
    e.stopPropagation()
    removeTab(tabId)
    if (pathname === href || pathname.startsWith(href + "?")) {
      router.push("/dashboard")
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sidebar: strong teal tint when live call */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-30 flex h-full flex-col transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-[var(--sidebar-w)]" : "w-0 overflow-hidden",
          !activeCall && "bg-card"
        )}
        style={
          {
            "--sidebar-w": SIDEBAR_WIDTH,
            ...(activeCall ? { backgroundColor: "hsl(168 60% 8% / 0.98)" } : {}),
          } as React.CSSProperties
        }
      >
        <div className="flex h-full w-[var(--sidebar-w)] min-w-[var(--sidebar-w)] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-border px-3.5 py-2.5">
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-2.5 text-foreground no-underline"
            >
              {siteConfig.logo === "icon" ? (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/40 bg-white/10">
                  <Radio className="h-3.5 w-3.5 text-white/90" />
                </div>
              ) : (
                <div className="relative h-7 w-7 shrink-0 overflow-hidden">
                  <Image
                    src={siteConfig.logo}
                    alt=""
                    fill
                    className="object-contain"
                    sizes="28px"
                  />
                </div>
              )}
              <span className="truncate text-sm font-medium">{siteConfig.siteName}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>
          <nav className="flex flex-1 flex-col gap-0 overflow-y-auto p-2.5">
            {tabs.map((tab) => {
              const base = tab.href.split("?")[0]
              const isActive =
                pathname === base ||
                pathname === tab.href ||
                pathname.startsWith(base + "/")
              const Icon = tabIcon(tab.type)
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "group flex items-center gap-1.5 border-l-2 pr-1",
                    isActive
                      ? "border-white/60 bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Link
                    href={tab.href}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2.5 text-sm no-underline transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate">{tab.label}</span>
                  </Link>
                  {tab.type !== "dashboard" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-white hover:bg-white/10 hover:text-white"
                      aria-label="Close tab"
                      onClick={(e) => handleCloseTab(e, tab.id, tab.href)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
            <div className="mt-1.5">
              {activeCall ? (
                <>
                  <div className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Live call
                  </div>
                  <Link
                    href={activeCall.href}
                    className="flex items-center gap-2 py-2.5 pl-2.5 pr-2.5 text-sm font-medium no-underline hover:opacity-90"
                    style={{
                      backgroundColor: "hsl(168, 100%, 42%)",
                      color: "hsl(222, 24%, 4%)",
                    }}
                  >
                    <Phone className="h-4.5 w-4.5 shrink-0" />
                    <span className="truncate">{activeCall.label}</span>
                  </Link>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex w-full items-center justify-center gap-2 border border-dashed border-white/30 px-2.5 py-2 text-sm text-white/80 hover:!bg-white hover:!border-white hover:!text-black"
                  onClick={() => setNewCallModalOpen(true)}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  New call
                </Button>
              )}
            </div>
            <div className="mt-auto flex flex-col gap-0 border-t border-border pt-2.5">
              {userEmail && (
                <p
                  className="truncate px-2.5 py-1.5 text-xs text-muted-foreground"
                  title={userEmail}
                >
                  {userEmail}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loggingOut}
                className="flex w-full justify-start items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleLogout()
                }}
              >
                <LogOut className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{loggingOut ? "…" : "Log out"}</span>
              </Button>
            </div>
          </nav>
        </div>
      </aside>

      {/* Trigger when sidebar closed */}
      {!sidebarOpen && (
        <div className="fixed left-2 top-2 z-40">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open navigation"
          >
            <PanelLeftClose className="h-3.5 w-3.5 rotate-180" />
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
