"use client"

import { cn } from "@/lib/utils"
import { useSidebar } from "@/hooks/use-sidebar"
import { UserProfile } from "./user-profile"
import { ThemeSwitcher } from "./theme-switcher"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Sidebar({ className }: SidebarProps) {
  const { isCollapsed, toggle } = useSidebar()

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex h-16 items-center justify-between px-4">
        <div className="text-lg font-semibold">Logo</div>
        <button onClick={toggle} className="md:hidden">
          {/* Toggler for mobile */}
        </button>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {/* Navigation items here */}
        <div className="text-sm text-muted-foreground">Navigation</div>
      </div>
      <div className="border-t p-4">
        <UserProfile />
      </div>
      <div className="border-t p-4">
        <ThemeSwitcher />
      </div>
    </div>
  )
}
