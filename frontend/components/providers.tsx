"use client"

import { Provider as ReduxProvider } from "react-redux"
import { store } from "@/store"
import { SidebarTabsProvider } from "@/context/sidebar-tabs-context"
import { NewCallModal } from "@/components/new-call-modal"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <SidebarTabsProvider>
        <NewCallModal />
        {children}
      </SidebarTabsProvider>
    </ReduxProvider>
  )
}
