import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'

const toneClasses = {
  neutral: '',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  return (
    <Badge variant="secondary" className={toneClasses[tone]} data-tone={tone}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  )
}
