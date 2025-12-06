'use client'

import * as React from 'react'
import { CheckIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

type CheckboxStatus = 'unchecked' | 'in-progress' | 'checked'

interface CheckboxProps {
  status?: CheckboxStatus
  checked?: boolean
  onStatusChange?: (status: CheckboxStatus) => void
  onCheckedChange?: (checked: boolean) => void
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

function Checkbox({
  status,
  checked,
  onStatusChange,
  onCheckedChange,
  className,
  onClick,
}: CheckboxProps) {
  // Derive status from checked prop if status not provided
  const derivedStatus: CheckboxStatus = status ?? (checked ? 'checked' : 'unchecked')

  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e)

    // Cycle through states: unchecked -> in-progress -> checked -> unchecked
    if (onStatusChange) {
      const nextStatus: CheckboxStatus =
        derivedStatus === 'unchecked'
          ? 'in-progress'
          : derivedStatus === 'in-progress'
            ? 'checked'
            : 'unchecked'
      onStatusChange(nextStatus)
    } else if (onCheckedChange) {
      // Legacy behavior: toggle between checked/unchecked
      onCheckedChange(!checked)
    }
  }

  // All states use consistent size-5 (20px) and 1.5px border width
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={derivedStatus === 'checked'}
      data-state={derivedStatus}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn('shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full', className)}
    >
      {derivedStatus === 'unchecked' && (
        <div className="size-4 rounded-full border-[1.5px] border-muted-foreground" />
      )}
      {derivedStatus === 'in-progress' && (
        <div className="size-4 rounded-full border-[1.5px] border-yellow-500 flex items-center justify-center overflow-hidden">
          <div className="size-2 rounded-full bg-yellow-500" style={{ clipPath: 'inset(0 50% 0 0)' }} />
        </div>
      )}
      {derivedStatus === 'checked' && (
        <div className="size-4 rounded-full bg-primary flex items-center justify-center">
          <CheckIcon
            className="size-2.5 text-primary-foreground"
            weight="bold"
          />
        </div>
      )}
    </button>
  )
}

export { Checkbox, type CheckboxStatus }
