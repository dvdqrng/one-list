"use client"

import type { ReactNode } from "react"
import { WarningCircleIcon } from "@phosphor-icons/react"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  className?: string
  children?: ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-6 ${className || ""}`}>
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        {icon || <WarningCircleIcon className="h-6 w-6 text-muted-foreground" weight="fill" />}
      </div>
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-[250px]">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
