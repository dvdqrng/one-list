"use client"

import { MainSidebar } from "./main-sidebar"

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <MainSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
