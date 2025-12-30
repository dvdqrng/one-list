"use client"

import { useMainSidebarStore } from "@/hooks/use-main-sidebar-store"
import { cn } from "@/lib/utils"
import { Home, List, Kanban, ChevronsLeft, ChevronsRight } from "lucide-react"
import Link from "next/link"
import { UserProfile } from "./user-profile"
import { ThemeSwitcher } from "./theme-switcher"
import { Button } from "@/components/ui/button"

export function MainSidebar() {
  const { isCollapsed, toggle } = useMainSidebarStore()

  return (
    <div
      className={cn(
        "h-full flex flex-col border-r transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <div
          className={cn(
            "text-lg font-semibold transition-opacity",
            isCollapsed && "opacity-0"
          )}
        >
          Logo
        </div>
        <Button variant="ghost" size="icon" onClick={toggle}>
          {isCollapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </Button>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
        >
          <Home className="h-5 w-5" />
          {!isCollapsed && <span>Home</span>}
        </Link>
        <Link
          href="/tasks"
          className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
        >
          <List className="h-5 w-5" />
          {!isCollapsed && <span>Tasks</span>}
        </Link>
        <Link
          href="/kanban"
          className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
        >
          <Kanban className="h-5 w-5" />
          {!isCollapsed && <span>Kanban</span>}
        </Link>
      </nav>
      <div className="space-y-2 border-t p-4">
        {!isCollapsed && (
          <>
            <UserProfile />
            <ThemeSwitcher />
          </>
        )}
      </div>
    </div>
  )
}