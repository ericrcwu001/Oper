"use client"

import React, { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store"

export type SidebarTabType = "dashboard" | "call" | "feedback"

export interface SidebarTab {
  id: string
  label: string
  href: string
  type: SidebarTabType
}

/** Sitewide: at most one live call at a time. Shown in sidebar bottom, not as a tab. */
export interface ActiveCall {
  sessionId: string
  label: string
  href: string
}

const DASHBOARD_TAB: SidebarTab = {
  id: "dashboard",
  label: "Dashboard",
  href: "/dashboard",
  type: "dashboard",
}

interface SidebarTabsContextValue {
  tabs: SidebarTab[]
  addTab: (tab: SidebarTab) => void
  updateTab: (id: string, updates: Partial<Pick<SidebarTab, "label" | "href" | "type">>) => void
  removeTab: (id: string) => void
  activeCall: ActiveCall | null
  setActiveCall: (call: ActiveCall | null) => void
  newCallModalOpen: boolean
  setNewCallModalOpen: (open: boolean) => void
}

const SidebarTabsContext = createContext<SidebarTabsContextValue | null>(null)

export function SidebarTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<SidebarTab[]>([DASHBOARD_TAB])
  const [newCallModalOpen, setNewCallModalOpen] = useState(false)
  const callState = useSelector((s: RootState) => s.call)
  const activeCall: ActiveCall | null = useMemo(
    () =>
      callState.callActive && callState.sessionId
        ? { sessionId: callState.sessionId, label: callState.label, href: callState.href }
        : null,
    [callState.callActive, callState.sessionId, callState.label, callState.href]
  )
  const setActiveCall = useCallback((_call: ActiveCall | null) => {
    // No-op: active call is now driven by Redux (call slice). Kept for API compat.
  }, [])

  const addTab = useCallback((tab: SidebarTab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev
      return [...prev, tab]
    })
  }, [])

  const updateTab = useCallback((id: string, updates: Partial<Pick<SidebarTab, "label" | "href" | "type">>) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    )
  }, [])

  const removeTab = useCallback((id: string) => {
    if (id === "dashboard") return
    setTabs((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(
    () => ({
      tabs,
      addTab,
      updateTab,
      removeTab,
      activeCall,
      setActiveCall,
      newCallModalOpen,
      setNewCallModalOpen,
    }),
    [tabs, addTab, updateTab, removeTab, activeCall, newCallModalOpen]
  )

  return (
    <SidebarTabsContext.Provider value={value}>
      {children}
    </SidebarTabsContext.Provider>
  )
}

export function useSidebarTabs() {
  const ctx = useContext(SidebarTabsContext)
  if (!ctx) throw new Error("useSidebarTabs must be used within SidebarTabsProvider")
  return ctx
}

export { DASHBOARD_TAB }
